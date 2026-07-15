const express = require('express');
const router = express.Router();

const { PANEL_PASSWORD } = process.env;

function handleLogin(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { password } = JSON.parse(body);
            if (password === PANEL_PASSWORD) {
                res.json({ success: true });
            } else {
                res.status(401).json({ error: 'wrong password' });
            }
        } catch (e) {
            res.status(400).json({ error: 'invalid request' });
        }
    });
}

router.post('/', handleLogin);

module.exports = router;