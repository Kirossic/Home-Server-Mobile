const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');
const { BASHRC_PATH, PG_DIR } = require('../../config/constants');
const { getShellPath } = require('../../utils/system');
const { logEvent } = require('../../services/events.service');

async function handleSystemRestart(req, res) {
    logEvent('system_restart', {});
    res.send('Restarting...');

    const killAndRestartCmd = [
        '( pkill -f "cloudflared"',
        'pkill -f "tunnel-watchdog.js"',
        'pg_ctl -D "' + PG_DIR + '" stop 2>/dev/null || pkill -f "postgres"',
        'pkill -9 -f "code-server"',
        'pkill -9 -f "Bukings.*server.js"',
        'pkill -9 -f "node backend/src/server.js"',
        'for i in 1 2 3 4 5; do',
        '  pgrep -f "node backend/src/server.js" >/dev/null 2>&1 || break',
        '  sleep 1',
        'done',
        'source ' + BASHRC_PATH + ' ) &'
    ].join('\n');
    setTimeout(() => execCommand(killAndRestartCmd, { shell: getShellPath(), timeout: 10000 }), 2000);
}

router.post('/restart', handleSystemRestart);

module.exports = router;