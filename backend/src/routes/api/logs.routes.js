const express = require('express');
const router = express.Router();

const { fs, path, os, exec, urlParams } = require('./_shared');

function handleLogs(req, res) {
    const name = urlParams(req).get('name') || 'main-server';
    const lines = urlParams(req).get('lines') || '50';
    const logDir = path.join(__dirname);
    const logFile = path.join(logDir, name + '.log');
    const altLog = path.join(os.homedir(), name + '.log');
    const target = fs.existsSync(logFile) ? logFile : (fs.existsSync(altLog) ? altLog : null);
    if (!target) return res.status(404).send('log not found');
    exec('tail -n ' + parseInt(lines) + ' "' + target + '"', { timeout: 5000 }, (err, stdout) => {
        if (err) return res.status(500).send('read failed');
        res.type('text/plain; charset=utf-8').send(stdout || '(empty)');
    });
}

router.get('/', handleLogs);

module.exports = router;