const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');

async function handleTerminalExec(req, res) {
    try {
        const { cmd, cwd } = req.body;
        if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd required' });
        const opts = { timeout: 30000 };
        if (cwd) opts.cwd = cwd;
        const { stdout, stderr, exitCode } = await execCommand(cmd, opts);
        res.json({ stdout, stderr, exitCode });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
}

router.post('/exec', handleTerminalExec);

module.exports = router;