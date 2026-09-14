const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');
const { logEvent } = require('../../services/events.service');

async function handleTerminalExec(req, res) {
    try {
        const { cmd, cwd } = req.body;
        if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd required' });
        const opts = { timeout: 30000 };
        if (cwd) opts.cwd = cwd;
        const { stdout, stderr, exitCode } = await execCommand(cmd, opts);
        
        // Log terminal command execution for audit
        logEvent(
            'terminal_exec', 
            { cmd: cmd.length > 250 ? cmd.slice(0, 250) + '...' : cmd, exitCode, cwd: cwd || '~' }, 
            exitCode === 0 ? 'info' : 'warn', 
            'security'
        );

        res.json({ stdout, stderr, exitCode });
    } catch (e) {
        logEvent('terminal_error', { cmd: (req.body && req.body.cmd) || '', error: e.message }, 'error', 'security');
        res.status(400).json({ error: e.message });
    }
}

router.post('/exec', handleTerminalExec);

module.exports = router;