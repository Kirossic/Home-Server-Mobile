const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');

async function handleProcessList(req, res) {
    try {
        const { stdout } = await execCommand('ps aux', { timeout: 5000 });
        const lines = stdout.trim().split('\n').slice(1); // skip header
        const processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 11) return null;
            return {
                pid: parts[1],
                user: parts[0],
                cpu: parts[2],
                mem: parts[3],
                vsz: parts[4],
                rss: parts[5],
                tty: parts[6],
                stat: parts[7],
                start: parts[8],
                time: parts[9],
                cmd: parts.slice(10).join(' ')
            };
        }).filter(Boolean);
        res.json(processes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve process list' });
    }
}

async function handleProcessKill(req, res) {
    try {
        const { pid } = req.body;
        if (!pid) return res.status(400).json({ error: 'pid required' });
        await execCommand(`kill ${parseInt(pid)}`, { timeout: 5000 });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to kill process' });
    }
}

router.get('/', handleProcessList);
router.post('/kill', handleProcessKill);

module.exports = router;