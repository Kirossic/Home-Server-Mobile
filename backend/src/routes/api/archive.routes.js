const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
  listArchives,
  createMonthlyArchive,
  queryArchive,
  restoreArchive,
  deleteArchive,
  getArchiveDir
} = require('../../services/archive.service');

router.get('/', (req, res) => {
  try {
    const list = listArchives();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { month } = req.body || {};
    const result = await createMonthlyArchive(month);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:filename/query', async (req, res) => {
  try {
    const { filename } = req.params;
    const { table, type, level, source, query, limit, offset, from, to } = req.query;
    const result = await queryArchive(filename, {
      table,
      type,
      level,
      source,
      query,
      limit: Math.min(parseInt(limit) || 100, 1000),
      offset: parseInt(offset) || 0,
      from,
      to
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:filename/restore', async (req, res) => {
  try {
    const { filename } = req.params;
    const { tables } = req.body || {};
    const result = await restoreArchive(filename, { tables });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:filename/download', (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(getArchiveDir(), safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Архив не найден');
    }

    res.download(filePath, safeFilename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const success = deleteArchive(filename);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
