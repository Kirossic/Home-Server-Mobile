const express = require('express');
const router = express.Router();

function handleLogin(req, res) {
    const { password } = req.body;
    if (password === process.env.PANEL_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
}

router.post('/', handleLogin);

module.exports = router;