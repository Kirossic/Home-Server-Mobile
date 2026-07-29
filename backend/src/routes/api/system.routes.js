const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');
const { BASHRC_PATH } = require('../../config/constants');
const { logEvent } = require('../../services/events.service');

async function handleSystemRestart(req, res) {
    logEvent('system_restart', {});
    res.send('Restarting...');

    const killAndRestartCmd = [
        '( pkill -f "cloudflared"',
        'pkill -f "postgres"',
        'kill -9 $(lsof -t -i:8085) 2>/dev/null',
        'kill -9 $(lsof -t -i:8080) 2>/dev/null',
        'for i in 1 2 3 4 5; do',
        '  fuser 8080/tcp 2>/dev/null || break',
        '  sleep 1',
        'done',
        'source ' + BASHRC_PATH + ' ) &'
    ].join('\n');
    setTimeout(() => execCommand(killAndRestartCmd, { shell: '/bin/bash', timeout: 5000 }), 2000);
}

router.post('/restart', handleSystemRestart);

module.exports = router;