const fs = require('fs');
const path = require('path');
const os = require('os');
const dns = require('dns').promises;
const { execCommand } = require('../utils/exec');

const panelLogPath = path.join(os.homedir(), 'panel_tunnel.log');
const ideLogPath = path.join(os.homedir(), 'ide_tunnel.log');
const watchdogPidPath = path.resolve(__dirname, '../../../data/tunnel-watchdog.pid');

const CHECK_INTERVAL_MS = 60 * 1000;
const COOLDOWN_MS = 90 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const FAILURE_THRESHOLD = 2;

const state = {
    panel: { failures: 0, lastRestart: 0, url: null },
    ide: { failures: 0, lastRestart: 0, url: null },
};

function log(level, message) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${ts}] [${level.toUpperCase()}] ${message}`);
}

function extractUrlFromLog(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (matches.length > 0) return matches[matches.length - 1];
    } catch (e) {}
    return null;
}

async function isInternetAvailable() {
    try {
        await Promise.race([
            dns.lookup('one.one.one.one'),
            dns.lookup('google.com'),
            fetch('https://1.1.1.1', { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
        ]);
        return true;
    } catch (e) {
        return false;
    }
}

async function isProcessAlive(port) {
    const { exitCode } = await execCommand(`pgrep -f "cloudflared tunnel.*${port}" >/dev/null 2>&1`);
    return exitCode === 0;
}

async function isUrlResponding(url) {
    if (!url || !url.startsWith('https://')) return false;
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: { 'User-Agent': 'Tunnel-Watchdog/1.0' }
        });
        // Any response (even 401/404/200/502 from cloudflare edge) means DNS + TLS + tunnel connection is active
        return res.status > 0;
    } catch (err) {
        return false;
    }
}

async function sendAlertIfConfigured(text) {
    try {
        const settingsPath = path.resolve(__dirname, '../../../data/settings.json');
        if (!fs.existsSync(settingsPath)) return;
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const tg = settings.telegram;
        if (!tg || !tg.enabled || !tg.botToken || !tg.chatId || !tg.notifyOnTunnelRestart) return;

        const url = `https://api.telegram.org/bot${tg.botToken}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: tg.chatId,
                text,
                parse_mode: 'HTML',
            }),
            signal: AbortSignal.timeout(10000),
        });
    } catch (err) {
        log('warn', `Не удалось отправить Telegram алерт: ${err.message}`);
    }
}

async function reportEventToPanel(type, detail, level = 'info') {
    try {
        await fetch('http://127.0.0.1:8080/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, detail, level, source: 'watchdog' }),
            signal: AbortSignal.timeout(3000)
        });
    } catch (e) {}
}

async function restartTunnel(name, port, logFile) {
    log('warn', `Перезапуск туннеля ${name} (порт ${port})...`);
    reportEventToPanel('watchdog_tunnel_restart', { name, port }, 'warn');
    state[name].lastRestart = Date.now();
    state[name].failures = 0;

    await execCommand(`pkill -f "cloudflared tunnel.*${port}" 2>/dev/null`);
    try { fs.writeFileSync(logFile, ''); } catch (e) {}
    await execCommand(`nohup cloudflared tunnel --config /dev/null --url http://localhost:${port} > "${logFile}" 2>&1 &`);

    // Poll for new URL up to 25s
    let newUrl = null;
    const startWait = Date.now();
    while (Date.now() - startWait < 25000) {
        await new Promise(r => setTimeout(r, 2000));
        newUrl = extractUrlFromLog(logFile);
        if (newUrl) break;
    }

    state[name].url = newUrl;
    log('info', `Туннель ${name} поднят. Новый URL: ${newUrl || '(ожидание)'}`);
    reportEventToPanel('watchdog_tunnel_restored', { name, port, url: newUrl }, 'info');

    if (newUrl) {
        await sendAlertIfConfigured(
            `🐕 <b>Watchdog восстановил туннель ${name.toUpperCase()}</b>\n\n` +
            `🔗 Новый URL: <code>${newUrl}</code>\n` +
            `🕒 Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`
        );
    }
}

async function checkTunnel(name, port, logFile) {
    const now = Date.now();
    if (now - state[name].lastRestart < COOLDOWN_MS) {
        log('debug', `Туннель ${name} в режиме cooldown, проверка пропущена.`);
        return;
    }

    const alive = await isProcessAlive(port);
    if (!alive) {
        state[name].failures++;
        log('warn', `Процесс туннеля ${name} не найден (сбой #${state[name].failures}/${FAILURE_THRESHOLD}).`);
        reportEventToPanel('watchdog_process_missing', { name, port, failures: state[name].failures }, 'warn');
        if (state[name].failures >= FAILURE_THRESHOLD) {
            await restartTunnel(name, port, logFile);
        }
        return;
    }

    const currentUrl = extractUrlFromLog(logFile);
    state[name].url = currentUrl;

    if (!currentUrl) {
        state[name].failures++;
        log('warn', `URL туннеля ${name} отсутствует в логе (сбой #${state[name].failures}/${FAILURE_THRESHOLD}).`);
        if (state[name].failures >= FAILURE_THRESHOLD) {
            await restartTunnel(name, port, logFile);
        }
        return;
    }

    const reachable = await isUrlResponding(currentUrl);
    if (!reachable) {
        state[name].failures++;
        log('warn', `URL туннеля ${name} (${currentUrl}) не отвечает (сбой #${state[name].failures}/${FAILURE_THRESHOLD}).`);
        if (state[name].failures >= FAILURE_THRESHOLD) {
            await restartTunnel(name, port, logFile);
        }
    } else {
        if (state[name].failures > 0) {
            log('info', `Туннель ${name} восстановил связь.`);
        }
        state[name].failures = 0;
    }
}

async function watchdogIteration() {
    try {
        const hasInternet = await isInternetAvailable();
        if (!hasInternet) {
            log('warn', 'Нет подключения к интернету. Проверка туннелей отложена.');
            state.panel.failures = 0;
            state.ide.failures = 0;
            return;
        }

        await checkTunnel('panel', 8080, panelLogPath);
        await checkTunnel('ide', 8085, ideLogPath);
    } catch (err) {
        log('error', `Ошибка в цикле сторожа: ${err.message}`);
    }
}

function handleSingleInstance() {
    try {
        const dataDir = path.dirname(watchdogPidPath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        if (fs.existsSync(watchdogPidPath)) {
            const oldPid = parseInt(fs.readFileSync(watchdogPidPath, 'utf-8'), 10);
            if (oldPid && !isNaN(oldPid)) {
                try {
                    process.kill(oldPid, 0); // Check if running
                    if (oldPid !== process.pid) {
                        console.error(`[watchdog] Экземпляр уже запущен с PID ${oldPid}. Завершение.`);
                        process.exit(0);
                    }
                } catch (e) {
                    // Stale PID file
                }
            }
        }
        fs.writeFileSync(watchdogPidPath, process.pid.toString(), 'utf-8');

        const cleanup = () => {
            try {
                if (fs.existsSync(watchdogPidPath)) {
                    const pid = parseInt(fs.readFileSync(watchdogPidPath, 'utf-8'), 10);
                    if (pid === process.pid) fs.unlinkSync(watchdogPidPath);
                }
            } catch (e) {}
            process.exit(0);
        };

        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        process.on('exit', () => {
            try {
                if (fs.existsSync(watchdogPidPath)) {
                    const pid = parseInt(fs.readFileSync(watchdogPidPath, 'utf-8'), 10);
                    if (pid === process.pid) fs.unlinkSync(watchdogPidPath);
                }
            } catch (e) {}
        });
    } catch (e) {
        log('warn', `PID lock setup error: ${e.message}`);
    }
}

process.on('uncaughtException', (err) => {
    log('error', `Uncaught exception: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason}`);
});

function main() {
    handleSingleInstance();
    log('info', '================================================');
    log('info', 'Сторожевой сервис Cloudflare Tunnels (Watchdog) запущен.');
    log('info', `Интервал проверки: ${CHECK_INTERVAL_MS / 1000}с, Cooldown: ${COOLDOWN_MS / 1000}с, Порог: ${FAILURE_THRESHOLD}.`);
    log('info', '================================================');

    // Initial check after 10s warmup
    setTimeout(() => {
        watchdogIteration();
        setInterval(watchdogIteration, CHECK_INTERVAL_MS);
    }, 10000);
}

main();
