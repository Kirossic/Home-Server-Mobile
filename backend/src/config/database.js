const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_DIR = path.resolve(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'metrics.db');

let db = null;
let isDirty = false;
let flushTimer = null;
const DEBOUNCE_FLUSH_MS = 15000; // 15 seconds debounce

function getDbSize() {
  try {
    if (!fs.existsSync(DB_PATH)) return { sizeBytes: 0, sizeFormatted: '0 B' };
    const stat = fs.statSync(DB_PATH);
    const bytes = stat.size;
    let sizeFormatted = bytes + ' B';
    if (bytes >= 1024 * 1024) {
      sizeFormatted = (bytes / 1024 / 1024).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
      sizeFormatted = (bytes / 1024).toFixed(1) + ' KB';
    }
    return { sizeBytes: bytes, sizeFormatted };
  } catch (e) {
    return { sizeBytes: 0, sizeFormatted: '0 B' };
  }
}

function flushDbSync() {
  if (!db || !isDirty) return;
  try {
    const data = Buffer.from(db.export());
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, DB_PATH);
    isDirty = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  } catch (err) {
    console.error('[db] Flush error:', err.message);
  }
}

function scheduleFlush() {
  isDirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDbSync();
  }, DEBOUNCE_FLUSH_MS);
}

function vacuumDb() {
  if (!db) throw new Error('Database not initialized');
  try {
    db.run('VACUUM;');
    isDirty = true;
    flushDbSync();
    const size = getDbSize();
    console.log(`[db] VACUUM completed. Новой размер базы: ${size.sizeFormatted}`);
    return size;
  } catch (err) {
    console.error('[db] VACUUM error:', err.message);
    throw err;
  }
}

async function initDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('[db] Created data directory:', DB_DIR);
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('[db] Loaded existing database:', getDbSize().sizeFormatted);
  } else {
    db = new SQL.Database();
    console.log('[db] Created new database');
    isDirty = true;
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
      level TEXT NOT NULL DEFAULT 'info',
      source TEXT NOT NULL DEFAULT 'system'
    );

    CREATE TABLE IF NOT EXISTS http_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ip TEXT,
      method TEXT,
      path TEXT,
      status INTEGER,
      duration_ms INTEGER,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_ram_ts ON metrics_ram(ts);
    CREATE INDEX IF NOT EXISTS idx_metrics_battery_ts ON metrics_battery(ts);
    CREATE INDEX IF NOT EXISTS idx_metrics_storage_ts ON metrics_storage(ts);
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_level ON events(level);
    CREATE INDEX IF NOT EXISTS idx_http_logs_ts ON http_logs(ts);
    CREATE INDEX IF NOT EXISTS idx_http_logs_status ON http_logs(status);
  `);

  // Migration for existing events table: add source column if missing
  try {
    db.run("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'system'");
    isDirty = true;
  } catch (e) {
    // Column already exists, ignore
  }

  // Create index on source column after ensuring column exists
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);");
  } catch (e) {}

  // Initial flush if dirty
  if (isDirty) {
    flushDbSync();
  }

  // Process exit safety hooks
  const exitHandler = () => {
    flushDbSync();
  };

  process.on('exit', exitHandler);
  process.on('SIGINT', () => { exitHandler(); process.exit(0); });
  process.on('SIGTERM', () => { exitHandler(); process.exit(0); });

  console.log('[db] Initialized successfully. Base size:', getDbSize().sizeFormatted);
  return db;
}

function dbRun(sql, params = [], options = {}) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  if (options.immediate) {
    flushDbSync();
  } else {
    scheduleFlush();
  }
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
  return { 
    run: dbRun, 
    all: dbAll, 
    get: dbGet, 
    flush: flushDbSync, 
    vacuum: vacuumDb, 
    getSize: getDbSize 
  };
}

module.exports = { 
  initDatabase, 
  getDb, 
  flushDb: flushDbSync, 
  vacuumDb, 
  getDbSize, 
  DB_PATH 
};
