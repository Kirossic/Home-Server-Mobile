const { getDb } = require('../config/database');

function logEvent(type, detail, level = 'info') {
  try {
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
    getDb().run('INSERT INTO events (type, detail, level) VALUES (?, ?, ?)', [type, detailStr, level]);
  } catch (err) {
    console.error('[events] Failed to write event:', err.message);
  }
}

function getEvents({ type, limit = 100, offset = 0, from, to } = {}) {
  const conditions = [];
  const params = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (from) {
    conditions.push('ts >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('ts <= ?');
    params.push(to);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = getDb().all(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const totalRow = getDb().get(`SELECT COUNT(*) as count FROM events ${where}`, params);

  return { rows, total: totalRow ? totalRow.count : 0, limit, offset };
}

module.exports = { logEvent, getEvents };
