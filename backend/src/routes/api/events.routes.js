const express = require('express');
const router = express.Router();
const { logEvent, getEvents, getHttpLogs } = require('../../services/events.service');
const { runMaintenance } = require('../../services/maintenance.service');
const { getDbSize } = require('../../config/database');

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type || null;
  const level = req.query.level || null;
  const source = req.query.source || null;
  const query = req.query.query || null;
  const from = req.query.from || null;
  const to = req.query.to || null;

  try {
    const result = getEvents({ type, level, source, query, limit, offset, from, to });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/http', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status || null;
  const method = req.query.method || null;
  const from = req.query.from || null;
  const to = req.query.to || null;

  try {
    const result = getHttpLogs({ limit, offset, status, method, from, to });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/db-stats', (req, res) => {
  try {
    const size = getDbSize();
    res.json({ size: size.sizeFormatted, bytes: size.sizeBytes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance', async (req, res) => {
  try {
    const stats = await runMaintenance();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { type, detail, level, source } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'type is required' });
  }

  try {
    logEvent(type, detail || '', level || 'info', source || 'system');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
