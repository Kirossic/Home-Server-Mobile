const express = require('express');
const router = express.Router();
const os = require('os');
const path = require('path');
const fs = require('fs');
const { getDiskSpace, getLocalIP } = require('../../utils/system');
const { execCommand } = require('../../utils/exec');

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

const { getBatteryStatus } = require('../../services/battery.service');

async function handleBattery(req, res) {
    try {
        const data = await getBatteryStatus();
        if (!data) return res.status(500).json({ error: 'battery info unavailable' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'battery info unavailable' });
    }
}

router.get('/stats', handleStats);
router.get('/battery', handleBattery);

module.exports = router;