const express = require('express');
const router = express.Router();

const { fs, path, os, exec, urlParams } = require('./_shared');

function handleLogs(req, res) {
    const name = urlParams(req).get('name') || 'main-server';
    const lines = urlParams(req).get('lines') || '50';
    const projectRoot = path.resolve(__dirname, '../../../../');
    const candidates = [
        path.join(projectRoot, name + '.log'),
        path.join(projectRoot, 'backend', name + '.log'),
        path.join(os.homedir(), name + '.log'),
        path.join(os.homedir(), 'projects', 'main-server', name + '.log'),
    ];

    const target = candidates.find(p => fs.existsSync(p)) || null;
    if (!target) return res.status(404).send('log not found');
    exec('tail -n ' + parseInt(lines) + ' "' + target + '"', { timeout: 5000 }, (err, stdout) => {
        if (err) return res.status(500).send('read failed');
        res.type('text/plain; charset=utf-8').send(stdout || '(empty)');
    });
}

router.get('/', handleLogs);

module.exports = router;