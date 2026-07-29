const express = require('express');
const router = express.Router();
const { logEvent, getEvents } = require('../../services/events.service');

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type || null;
  const from = req.query.from || null;
  const to = req.query.to || null;

  try {
    const result = getEvents({ type, limit, offset, from, to });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { type, detail, level } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }

  try {
    logEvent(type, detail || '', level || 'info');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
