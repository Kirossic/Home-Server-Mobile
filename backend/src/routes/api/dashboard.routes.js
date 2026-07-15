const express = require('express');
const router = express.Router();

const { os, fs, path, exec, getDiskSpace, getLocalIP } = require('./_shared');

async function handleStats(req, res) {
    try {
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const disk = await getDiskSpace();
        const loadAvg = os.loadavg();
        const uptimeSec = os.uptime();
        const interfaces = os.networkInterfaces();
        const netList = [];
        for (const name in interfaces) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4') {
                    netList.push({ name, address: iface.address, internal: iface.internal });
                }
            }
        }
        res.json({
            ramTotal: totalMem,
            ramUsed: (totalMem - freeMem).toFixed(2),
            ramFree: freeMem,
            diskTotal: disk.total,
            diskUsed: disk.used,
            diskDetail: disk.total + ' / ' + disk.used,
            ip: getLocalIP(),
            uptime: Math.round(uptimeSec / 60),
            uptimeFull: {
                days: Math.floor(uptimeSec / 86400),
                hours: Math.floor((uptimeSec % 86400) / 3600),
                minutes: Math.floor((uptimeSec % 3600) / 60)
            },
            loadAvg: { one: loadAvg[0].toFixed(2), five: loadAvg[1].toFixed(2), fifteen: loadAvg[2].toFixed(2) },
            os: os.type() + ' / ' + os.release(),
            osFull: { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), release: os.release() },
            network: netList
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

function handleTunnelLinks(req, res) {
    const panelLogPath = path.join(os.homedir(), 'panel_tunnel.log');
    const ideLogPath = path.join(os.homedir(), 'ide_tunnel.log');
    let panelUrl = 'Генерация...';
    let ideUrl = 'Генерация...';
    if (fs.existsSync(panelLogPath)) {
        const d = fs.readFileSync(panelLogPath, 'utf-8');
        const m = d.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (m.length > 0) panelUrl = m[m.length - 1];
    }
    if (fs.existsSync(ideLogPath)) {
        const d = fs.readFileSync(ideLogPath, 'utf-8');
        const m = d.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (m.length > 0) ideUrl = m[m.length - 1];
    }
        res.json({ panelUrl, ideUrl });
}

let batteryLock = false;
function handleBattery(req, res) {
    if (batteryLock) return res.status(429).json({ error: 'busy' });
    batteryLock = true;
    exec('termux-battery-status', { timeout: 5000 }, (err, stdout) => {
        batteryLock = false;
        exec('pkill -f "termux-api BatteryStatus" 2>/dev/null', () => {});
        if (err) return res.status(500).json({ error: 'battery info unavailable' });
        try { res.json(JSON.parse(stdout)); }
        catch (e) { res.status(500).json({ error: 'parse failed' }); }
    });
}

    router.get('/stats', handleStats);
    router.get('/tunnel/links', handleTunnelLinks);
    router.get('/battery', handleBattery);

module.exports = router;