const express = require('express');
const router = express.Router();
const { PANEL_PASSWORD } = require('../../config/constants');
const { logEvent } = require('../../services/events.service');

function handleLogin(req, res) {
    const { password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    if (password === PANEL_PASSWORD) {
        logEvent('auth_login_success', { ip }, 'info', 'security');
        res.json({ success: true });
    } else {
        logEvent('auth_login_failed', { ip }, 'warn', 'security');
        res.status(401).json({ error: 'Invalid password' });
    }
}

router.post('/', handleLogin);

module.exports = router;