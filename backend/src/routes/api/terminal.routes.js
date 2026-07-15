const express = require('express');
const router = express.Router();

const { exec } = require('./_shared');

function handleTerminalExec(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { cmd, cwd } = JSON.parse(body);
            if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd required' });
            const opts = { timeout: 30000 };
            if (cwd) opts.cwd = cwd;
            exec(cmd, opts, (err, stdout, stderr) => {
                res.json({ stdout: stdout, stderr: stderr, exitCode: err ? (err.code || 1) : 0 });
            });
        } catch (e) {
            res.status(400).json({ error: 'invalid request' });
        }
    });
}

router.post('/exec', handleTerminalExec);

module.exports = router;