const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_DIR = path.resolve(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'metrics.db');

let db = null;

async function initDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('[db] Created data directory:', DB_DIR);
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[db] Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('[db] Created new database');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS metrics_ram (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      used_gb REAL,
      total_gb REAL,
      free_gb REAL,
      load_1m REAL,
      load_5m REAL,
      load_15m REAL
    );

    CREATE TABLE IF NOT EXISTS metrics_battery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      percentage INTEGER,
      status TEXT,
      temperature REAL,
      voltage INTEGER,
      health TEXT,
      cycles INTEGER
    );

    CREATE TABLE IF NOT EXISTS metrics_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      mount TEXT,
      total_gb REAL,
      used_gb REAL,
      avail_gb REAL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      type TEXT NOT NULL,
      detail TEXT,
      level TEXT NOT NULL DEFAULT 'info'
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_ram_ts ON metrics_ram(ts);
    CREATE INDEX IF NOT EXISTS idx_metrics_battery_ts ON metrics_battery(ts);
    CREATE INDEX IF NOT EXISTS idx_metrics_storage_ts ON metrics_storage(ts);
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  `);

  saveDb();

  console.log('[db] Initialized:', DB_PATH);
  return db;
}

function saveDb() {
  try {
    const data = Buffer.from(db.export());
    fs.writeFileSync(DB_PATH, data);
  } catch (err) {
    console.error('[db] Save error:', err.message);
  }
}

function dbRun(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  saveDb();
}

function dbAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return { run: dbRun, all: dbAll, get: dbGet };
}

module.exports = { initDatabase, getDb };
