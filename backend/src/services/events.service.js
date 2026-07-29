const { getDb } = require('../config/database');

const db = () => getDb();

function logEvent(type, detail, level = 'info') {
  try {
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
    db().prepare('INSERT INTO events (type, detail, level) VALUES (?, ?, ?)').run(type, detailStr, level);
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
  const rows = db().prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const total = db().prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(...params).count;

  return { rows, total, limit, offset };
}

module.exports = { logEvent, getEvents };
