const express = require('express');
const router = express.Router();
const { execCommand } = require('../../utils/exec');

async function handleProcessList(req, res) {
    try {
        const { stdout } = await execCommand('ps aux', { timeout: 5000 });
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
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve process list' });
    }
}

const { logEvent } = require('../../services/events.service');

async function handleProcessKill(req, res) {
    try {
        const { pid } = req.body;
        const targetPid = parseInt(pid, 10);
        if (!targetPid || isNaN(targetPid) || targetPid <= 1) {
            return res.status(400).json({ error: 'Недопустимый PID' });
        }
        if (targetPid === process.pid) {
            return res.status(400).json({ error: 'Нельзя завершить собственный процесс сервера' });
        }
        const { exitCode } = await execCommand(`kill ${targetPid}`, { timeout: 5000 });
        if (exitCode === 0) {
            logEvent('process_kill', { pid: targetPid }, 'warn', 'security');
            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'Не удалось завершить процесс (PID не существует или нет прав)' });
        }
    } catch (error) {
        logEvent('process_kill_error', { pid: req.body && req.body.pid, error: error.message }, 'error', 'security');
        res.status(500).json({ error: 'Failed to kill process' });
    }
}

router.get('/', handleProcessList);
router.post('/kill', handleProcessKill);

module.exports = router;