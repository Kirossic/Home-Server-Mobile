const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.resolve(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'metrics.db');

let db;

function initDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('[db] Created data directory:', DB_DIR);
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
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

  console.log('[db] Initialized:', DB_PATH);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

module.exports = { initDatabase, getDb };
