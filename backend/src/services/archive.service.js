const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { getDb, DB_PATH, vacuumDb, flushDb } = require('../config/database');
const { logEvent } = require('./events.service');

const DB_DIR = path.dirname(DB_PATH);
const ARCHIVES_DIR = path.join(DB_DIR, 'archives');

function getArchiveDir() {
  if (!fs.existsSync(ARCHIVES_DIR)) {
    fs.mkdirSync(ARCHIVES_DIR, { recursive: true });
  }
  return ARCHIVES_DIR;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function listArchives() {
  const dir = getArchiveDir();
  const files = fs.readdirSync(dir).filter(f => f.startsWith('metrics_') && f.endsWith('.db'));
  const list = [];

  for (const f of files) {
    try {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      const mMatch = f.match(/metrics_(\d{4}-\d{2})\.db/);
      const month = mMatch ? mMatch[1] : f;

      list.push({
        filename: f,
        month,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        mtime: stat.mtime.toISOString(),
      });
    } catch (e) {}
  }

  list.sort((a, b) => b.month.localeCompare(a.month));
  return list;
}

async function createMonthlyArchive(targetMonth) {
  const activeDb = getDb();
  let month = targetMonth;

  if (!month) {
    // Find oldest completed month in active DB
    const row = activeDb.get(`
      SELECT strftime('%Y-%m', ts) as m 
      FROM metrics_ram 
      WHERE strftime('%Y-%m', ts) < strftime('%Y-%m', 'now', 'localtime') 
      ORDER BY ts ASC 
      LIMIT 1
    `);
    if (!row || !row.m) {
      return { success: false, message: 'Нет завершённых месяцев для архивации' };
    }
    month = row.m;
  }

  // Validate format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Неверный формат месяца. Ожидается YYYY-MM');
  }

  const SQL = await initSqlJs();
  const archDb = new SQL.Database();

  archDb.run(`
    CREATE TABLE IF NOT EXISTS metrics_ram (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      used_gb REAL,
      total_gb REAL,
      free_gb REAL,
      load_1m REAL,
      load_5m REAL,
      load_15m REAL
    );

    CREATE TABLE IF NOT EXISTS metrics_battery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      percentage INTEGER,
      status TEXT,
      temperature REAL,
      voltage INTEGER,
      health TEXT,
      cycles INTEGER
    );

    CREATE TABLE IF NOT EXISTS metrics_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      mount TEXT,
      total_gb REAL,
      used_gb REAL,
      avail_gb REAL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      detail TEXT,
      level TEXT NOT NULL DEFAULT 'info',
      source TEXT NOT NULL DEFAULT 'system'
    );

    CREATE TABLE IF NOT EXISTS http_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      ip TEXT,
      method TEXT,
      path TEXT,
      status INTEGER,
      duration_ms INTEGER,
      user_agent TEXT
    );
  `);

  // 1. Copy metrics_ram for this month (hourly roll-up)
  const ramRows = activeDb.all(`
    SELECT 
      strftime('%Y-%m-%d %H:00:00', ts) as ts,
      ROUND(AVG(used_gb), 2) as used_gb,
      ROUND(AVG(total_gb), 2) as total_gb,
      ROUND(AVG(free_gb), 2) as free_gb,
      ROUND(AVG(load_1m), 2) as load_1m,
      ROUND(AVG(load_5m), 2) as load_5m,
      ROUND(AVG(load_15m), 2) as load_15m
    FROM metrics_ram
    WHERE strftime('%Y-%m', ts) = ?
    GROUP BY strftime('%Y-%m-%d %H:00:00', ts)
    ORDER BY ts ASC
  `, [month]);

  for (const r of ramRows) {
    archDb.run(
      "INSERT INTO metrics_ram (ts, used_gb, total_gb, free_gb, load_1m, load_5m, load_15m) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.ts, r.used_gb, r.total_gb, r.free_gb, r.load_1m, r.load_5m, r.load_15m]
    );
  }

  // 2. Copy metrics_battery for this month
  const batteryRows = activeDb.all(`
    SELECT 
      strftime('%Y-%m-%d %H:00:00', ts) as ts,
      ROUND(AVG(percentage)) as percentage,
      status,
      ROUND(AVG(temperature), 1) as temperature,
      ROUND(AVG(voltage)) as voltage,
      health,
      MAX(cycles) as cycles
    FROM metrics_battery
    WHERE strftime('%Y-%m', ts) = ?
    GROUP BY strftime('%Y-%m-%d %H:00:00', ts)
    ORDER BY ts ASC
  `, [month]);

  for (const r of batteryRows) {
    archDb.run(
      "INSERT INTO metrics_battery (ts, percentage, status, temperature, voltage, health, cycles) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.ts, r.percentage, r.status, r.temperature, r.voltage, r.health, r.cycles]
    );
  }

  // 3. Copy metrics_storage for this month
  const storageRows = activeDb.all(`
    SELECT 
      strftime('%Y-%m-%d %H:00:00', ts) as ts,
      mount,
      ROUND(AVG(total_gb), 2) as total_gb,
      ROUND(AVG(used_gb), 2) as used_gb,
      ROUND(AVG(avail_gb), 2) as avail_gb
    FROM metrics_storage
    WHERE strftime('%Y-%m', ts) = ?
    GROUP BY strftime('%Y-%m-%d %H:00:00', ts), mount
    ORDER BY ts ASC
  `, [month]);

  for (const r of storageRows) {
    archDb.run(
      "INSERT INTO metrics_storage (ts, mount, total_gb, used_gb, avail_gb) VALUES (?, ?, ?, ?, ?)",
      [r.ts, r.mount, r.total_gb, r.used_gb, r.avail_gb]
    );
  }

  // 4. Copy events for this month
  const eventRows = activeDb.all(`
    SELECT ts, type, detail, level, source
    FROM events
    WHERE strftime('%Y-%m', ts) = ?
    ORDER BY id ASC
  `, [month]);

  for (const r of eventRows) {
    archDb.run(
      "INSERT INTO events (ts, type, detail, level, source) VALUES (?, ?, ?, ?, ?)",
      [r.ts, r.type, r.detail, r.level, r.source || 'system']
    );
  }

  // 5. Copy http_logs for this month
  const httpRows = activeDb.all(`
    SELECT ts, ip, method, path, status, duration_ms, user_agent
    FROM http_logs
    WHERE strftime('%Y-%m', ts) = ?
    ORDER BY id ASC
  `, [month]);

  for (const r of httpRows) {
    archDb.run(
      "INSERT INTO http_logs (ts, ip, method, path, status, duration_ms, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.ts, r.ip, r.method, r.path, r.status, r.duration_ms, r.user_agent]
    );
  }

  // Optimize archive DB
  archDb.run(`
    CREATE INDEX IF NOT EXISTS idx_arch_ram_ts ON metrics_ram(ts);
    CREATE INDEX IF NOT EXISTS idx_arch_bat_ts ON metrics_battery(ts);
    CREATE INDEX IF NOT EXISTS idx_arch_str_ts ON metrics_storage(ts);
    CREATE INDEX IF NOT EXISTS idx_arch_ev_ts ON events(ts);
    VACUUM;
  `);

  const archBuf = Buffer.from(archDb.export());
  const filename = `metrics_${month}.db`;
  const targetPath = path.join(getArchiveDir(), filename);
  fs.writeFileSync(targetPath, archBuf);

  // Remove archived data from active DB
  activeDb.run("DELETE FROM metrics_ram WHERE strftime('%Y-%m', ts) = ?", [month]);
  activeDb.run("DELETE FROM metrics_battery WHERE strftime('%Y-%m', ts) = ?", [month]);
  activeDb.run("DELETE FROM metrics_storage WHERE strftime('%Y-%m', ts) = ?", [month]);
  activeDb.run("DELETE FROM events WHERE strftime('%Y-%m', ts) = ?", [month]);
  activeDb.run("DELETE FROM http_logs WHERE strftime('%Y-%m', ts) = ?", [month]);

  vacuumDb();

  const summary = {
    month,
    filename,
    sizeBytes: archBuf.length,
    sizeFormatted: formatBytes(archBuf.length),
    recordsArchived: {
      ram: ramRows.length,
      battery: batteryRows.length,
      storage: storageRows.length,
      events: eventRows.length,
      http: httpRows.length
    }
  };

  console.log(`[archive] Создан архив ${filename} (${summary.sizeFormatted}). RAM: ${ramRows.length}, Событий: ${eventRows.length}`);
  logEvent('db_archive_created', summary, 'info', 'system');

  return { success: true, archive: summary };
}

async function autoArchiveCompletedMonths() {
  const activeDb = getDb();
  const rows = activeDb.all(`
    SELECT DISTINCT strftime('%Y-%m', ts) as m 
    FROM metrics_ram 
    WHERE strftime('%Y-%m', ts) < strftime('%Y-%m', 'now', 'localtime')
  `);

  const results = [];
  for (const r of rows) {
    if (r.m) {
      try {
        const res = await createMonthlyArchive(r.m);
        results.push(res);
      } catch (e) {
        console.error(`[archive] Ошибка архивации месяца ${r.m}:`, e.message);
      }
    }
  }
  return results;
}

async function queryArchive(filename, { table = 'events', type, level, source, query, limit = 100, offset = 0, from, to } = {}) {
  const safeFilename = path.basename(filename);
  if (!safeFilename.startsWith('metrics_') || !safeFilename.endsWith('.db')) {
    throw new Error('Некорректное имя архивного файла');
  }

  const filePath = path.join(getArchiveDir(), safeFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error('Архивный файл не найден');
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(filePath);
  const archDb = new SQL.Database(buffer);

  try {
    const validTables = ['events', 'metrics_ram', 'metrics_battery', 'metrics_storage', 'http_logs'];
    const targetTable = validTables.includes(table) ? table : 'events';

    const conditions = [];
    const params = [];

    if (type && targetTable === 'events') {
      conditions.push('type = ?');
      params.push(type);
    }
    if (level && targetTable === 'events') {
      conditions.push('level = ?');
      params.push(level);
    }
    if (source && targetTable === 'events') {
      conditions.push('source = ?');
      params.push(source);
    }
    if (query && targetTable === 'events') {
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

    const stmt = archDb.prepare(`SELECT * FROM ${targetTable} ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`);
    stmt.bind([...params, limit, offset]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();

    const totalStmt = archDb.prepare(`SELECT COUNT(*) as count FROM ${targetTable} ${where}`);
    if (params.length > 0) totalStmt.bind(params);
    let total = 0;
    if (totalStmt.step()) total = totalStmt.getAsObject().count;
    totalStmt.free();

    return { rows, total, limit, offset, table: targetTable, filename: safeFilename };
  } finally {
    archDb.close();
  }
}

async function restoreArchive(filename, options = {}) {
  const safeFilename = path.basename(filename);
  const filePath = path.join(getArchiveDir(), safeFilename);
  if (!fs.existsSync(filePath)) {
    throw new Error('Архив не найден: ' + safeFilename);
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(filePath);
  const archDb = new SQL.Database(buffer);
  const activeDb = getDb();

  const tablesToRestore = options.tables || ['events', 'metrics_ram', 'metrics_battery', 'metrics_storage'];
  const restoredCounts = {};

  try {
    for (const tbl of tablesToRestore) {
      try {
        const stmt = archDb.prepare(`SELECT * FROM ${tbl}`);
        let count = 0;
        while (stmt.step()) {
          const row = stmt.getAsObject();
          delete row.id; // Allow AUTOINCREMENT to allocate clean ids
          const keys = Object.keys(row);
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map(k => row[k]);
          activeDb.run(`INSERT INTO ${tbl} (${keys.join(', ')}) VALUES (${placeholders})`, values);
          count++;
        }
        stmt.free();
        restoredCounts[tbl] = count;
      } catch (err) {
        console.error(`[restore] Ошибка восстановления таблицы ${tbl}:`, err.message);
      }
    }

    flushDb();
    const result = { filename: safeFilename, restored: restoredCounts };
    logEvent('db_archive_restored', result, 'info', 'system');
    return { success: true, result };
  } finally {
    archDb.close();
  }
}

function deleteArchive(filename) {
  const safeFilename = path.basename(filename);
  const filePath = path.join(getArchiveDir(), safeFilename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logEvent('db_archive_deleted', { filename: safeFilename }, 'warn', 'system');
    return true;
  }
  return false;
}

module.exports = {
  getArchiveDir,
  listArchives,
  createMonthlyArchive,
  autoArchiveCompletedMonths,
  queryArchive,
  restoreArchive,
  deleteArchive
};
