const { getDb } = require('../config/database');

function logEvent(type, detail, level = 'info', source = 'system') {
  try {
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
    getDb().run(
      'INSERT INTO events (type, detail, level, source) VALUES (?, ?, ?, ?)',
      [type, detailStr, level, source]
    );
  } catch (err) {
    console.error('[events] Ошибка записи события:', err.message);
  }
}

function getEvents({ type, level, source, query, limit = 100, offset = 0, from, to } = {}) {
  const conditions = [];
  const params = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (level) {
    conditions.push('level = ?');
    params.push(level);
  }
  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (query) {
    conditions.push('(type LIKE ? OR detail LIKE ?)');
    params.push(`%${query}%`, `%${query}%`);
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

  const rows = getDb().all(
    `SELECT * FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalRow = getDb().get(`SELECT COUNT(*) as count FROM events ${where}`, params);

  return { rows, total: totalRow ? totalRow.count : 0, limit, offset };
}

function logHttpAccess({ ip, method, path, status, duration_ms, user_agent }) {
  try {
    getDb().run(
      `INSERT INTO http_logs (ip, method, path, status, duration_ms, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ip || '', method || '', path || '', status || 200, duration_ms || 0, user_agent || '']
    );
  } catch (err) {
    console.error('[http_logs] Ошибка записи лога запроса:', err.message);
  }
}

function getHttpLogs({ limit = 100, offset = 0, status, method, from, to } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(parseInt(status, 10));
  }
  if (method) {
    conditions.push('method = ?');
    params.push(method.toUpperCase());
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

  const rows = getDb().all(
    `SELECT * FROM http_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const totalRow = getDb().get(`SELECT COUNT(*) as count FROM http_logs ${where}`, params);

  return { rows, total: totalRow ? totalRow.count : 0, limit, offset };
}

module.exports = { 
  logEvent, 
  getEvents, 
  logHttpAccess, 
  getHttpLogs 
};
