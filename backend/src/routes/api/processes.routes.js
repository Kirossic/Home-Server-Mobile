const express = require('express');
const router = express.Router();

const { exec } = require('./_shared');

function handleProcessList(req, res) {
    exec('ps aux', { timeout: 5000 }, (err, stdout) => {
        if (err) return res.status(500).json({ error: 'ps aux failed' });
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
    });
}

function handleProcessKill(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { pid } = JSON.parse(body);
            if (!pid) return res.status(400).json({ error: 'pid required' });
            exec('kill ' + parseInt(pid), (err) => {
                if (err) return res.status(500).json({ error: 'kill failed' });
                res.json({ success: true });
            });
        } catch (e) {
            res.status(400).json({ error: 'invalid request' });
        }
    });
}

router.get('/', handleProcessList);
router.post('/kill', handleProcessKill);

module.exports = router;