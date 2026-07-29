const express = require('express');
const router = express.Router();
const { getMetrics } = require('../../services/metrics-collector');

const VALID_TYPES = ['metrics_ram', 'metrics_battery', 'metrics_storage'];

router.get('/:type', (req, res) => {
  const type = 'metrics_' + req.params.type;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid type. Use: ram, battery, storage' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
  const from = req.query.from || null;
  const to = req.query.to || null;

  try {
    const data = getMetrics(type, { limit, from, to });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
