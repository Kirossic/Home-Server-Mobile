const fs = require('fs');
const path = require('path');
const os = require('os');
const { execCommand } = require('../utils/exec');
const { logEvent } = require('./events.service');

const panelLogPath = path.join(os.homedir(), 'panel_tunnel.log');
const ideLogPath = path.join(os.homedir(), 'ide_tunnel.log');

const tunnelState = {
    status: 'ready', // 'ready' | 'restarting' | 'error'
    lastRestartTime: null,
    lastError: null,
};

function extractUrlFromLog(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (matches.length > 0) return matches[matches.length - 1];
    } catch (e) {}
    return null;
}

async function getTunnelStatus() {
    const { exitCode: panelCode } = await execCommand('pgrep -f "cloudflared tunnel.*8080" >/dev/null 2>&1');
    const { exitCode: ideCode } = await execCommand('pgrep -f "cloudflared tunnel.*8085" >/dev/null 2>&1');

    const panelRunning = panelCode === 0;
    const ideRunning = ideCode === 0;

    let panelUrl = extractUrlFromLog(panelLogPath);
    let ideUrl = extractUrlFromLog(ideLogPath);

    if (!panelRunning && tunnelState.status !== 'restarting') {
        panelUrl = null;
    }
    if (!ideRunning && tunnelState.status !== 'restarting') {
        ideUrl = null;
    }

    return {
        status: tunnelState.status,
        panelUrl: panelUrl || (panelRunning ? 'Генерация...' : 'Остановлен'),
        ideUrl: ideUrl || (ideRunning ? 'Генерация...' : 'Остановлен'),
        panelRunning,
        ideRunning,
        lastRestartTime: tunnelState.lastRestartTime,
        lastError: tunnelState.lastError,
    };
}

async function triggerTunnelRestart(target = 'all') {
    if (tunnelState.status === 'restarting') {
        return { success: true, status: 'restarting', message: 'Перезапуск уже выполняется' };
    }

    tunnelState.status = 'restarting';
    tunnelState.lastRestartTime = Date.now();
    tunnelState.lastError = null;

    // Run restart in background without blocking caller
    (async () => {
        try {
            if (target === 'all' || target === 'panel') {
                await execCommand('pkill -f "cloudflared tunnel.*8080" 2>/dev/null');
                try { fs.writeFileSync(panelLogPath, ''); } catch (e) {}
                await execCommand('nohup cloudflared tunnel --config /dev/null --url http://localhost:8080 > "' + panelLogPath + '" 2>&1 &');
            }

            if (target === 'all' || target === 'ide') {
                await execCommand('pkill -f "cloudflared tunnel.*8085" 2>/dev/null');
                try { fs.writeFileSync(ideLogPath, ''); } catch (e) {}
                await execCommand('nohup cloudflared tunnel --config /dev/null --url http://localhost:8085 > "' + ideLogPath + '" 2>&1 &');
            }

            // Wait for both URLs to be generated up to 25 seconds
            let newPanelUrl = null;
            let newIdeUrl = null;
            const startTime = Date.now();

            while (Date.now() - startTime < 25000) {
                await new Promise(res => setTimeout(res, 2000));
                newPanelUrl = extractUrlFromLog(panelLogPath);
                newIdeUrl = extractUrlFromLog(ideLogPath);
                if (newPanelUrl && newIdeUrl) break;
            }

            tunnelState.status = 'ready';
            logEvent('tunnel_restart', { target, panelUrl: newPanelUrl, ideUrl: newIdeUrl });

            // Notify Telegram if configured
            try {
                const { sendTunnelAlert } = require('./telegram.service');
                await sendTunnelAlert({
                    panelUrl: newPanelUrl,
                    ideUrl: newIdeUrl,
                    reason: 'Мягкий перезапуск туннелей',
                });
            } catch (e) {}

        } catch (err) {
            tunnelState.status = 'error';
            tunnelState.lastError = err.message;
            logEvent('tunnel_restart_error', { error: err.message });
        }
    })();

    return { success: true, status: 'restarting', message: 'Перезапуск туннелей запущен в фоне' };
}

module.exports = {
    getTunnelStatus,
    triggerTunnelRestart,
    extractUrlFromLog,
    panelLogPath,
    ideLogPath,
};
