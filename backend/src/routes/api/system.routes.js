const express = require('express');
const router = express.Router();

const { exec, BASHRC_PATH } = require('./_shared');

function handleSystemRestart(req, res) {
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
    setTimeout(() => exec(killAndRestartCmd, { shell: '/bin/bash' }), 500);
}

router.post('/restart', handleSystemRestart);

module.exports = router;