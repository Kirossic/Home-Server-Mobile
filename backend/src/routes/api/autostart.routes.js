const express = require('express');
const router = express.Router();
const fs = require('fs');
const { BASHRC_PATH } = require('../../config/constants');
const { logEvent } = require('../../services/events.service');

function handleAutostartGet(req, res) {
    fs.readFile(BASHRC_PATH, 'utf-8', (err, data) => {
        if (err) return res.status(500).send('Не удалось прочитать .bashrc');
        res.type('text/plain; charset=utf-8').send(data);
    });
}

async function handleAutostartSave(req, res) {
    fs.writeFile(BASHRC_PATH, req.body, 'utf-8', (err) => {
        if (err) {
            logEvent('autostart_save_error', { error: err.message }, 'error', 'actions');
            return res.status(500).send('Не удалось записать .bashrc');
        }
        logEvent('autostart_save', { size: req.body ? req.body.length : 0 }, 'info', 'actions');
        res.send('Saved');
    });
}

router.get('/get', handleAutostartGet);
router.post('/save', handleAutostartSave);

module.exports = router;