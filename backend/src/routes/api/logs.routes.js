const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execCommand } = require('../../utils/exec');

async function handleLogs(req, res) {
    const rawName = req.query.name || 'main-server';
    const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '');
    const lines = parseInt(req.query.lines, 10) || 100;
    const projectRoot = path.resolve(__dirname, '../../../../');
    const candidates = [
        path.join(projectRoot, name + '.log'),
        path.join(projectRoot, 'backend', name + '.log'),
        path.join(os.homedir(), name + '.log'),
        path.join(os.homedir(), 'projects', 'main-server', name + '.log'),
    ];

    const target = candidates.find(p => fs.existsSync(p)) || null;
    if (!target) return res.status(404).send('log not found');

    const { stdout } = await execCommand(`tail -n ${lines} "${target}"`, { timeout: 5000 });
    res.type('text/plain; charset=utf-8').send(stdout || '(empty)');
}

router.get('/', handleLogs);

module.exports = router;