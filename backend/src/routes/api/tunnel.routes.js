const express = require('express');
const router = express.Router();
const { getTunnelStatus, triggerTunnelRestart } = require('../../services/tunnel.service');

async function handleLinks(req, res) {
    try {
        const status = await getTunnelStatus();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

async function handleRestart(req, res) {
    try {
        const target = req.body.target || 'all';
        const result = await triggerTunnelRestart(target);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

router.get('/links', handleLinks);
router.get('/status', handleLinks);
router.post('/restart', handleRestart);

module.exports = router;
