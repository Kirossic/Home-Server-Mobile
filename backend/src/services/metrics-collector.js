const os = require('os');
const { getDb } = require('../config/database');
const { execCommand } = require('../utils/exec');
const { getDiskSpace } = require('../utils/system');
const { logEvent } = require('./events.service');

const db = () => getDb();

let intervals = [];

function startCollector() {
  logEvent('server_start', { uptime: os.uptime(), hostname: os.hostname() });

  collectRam();
  collectBattery();
  collectStorage();

  intervals.push(setInterval(collectRam, 60_000));
  intervals.push(setInterval(collectBattery, 300_000));
  intervals.push(setInterval(collectStorage, 600_000));

  console.log('[metrics] Collector started (RAM:60s, Battery:5m, Storage:10m)');
}

function stopCollector() {
  intervals.forEach(clearInterval);
  intervals = [];
  console.log('[metrics] Collector stopped');
}

function collectRam() {
  try {
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const loadAvg = os.loadavg();

    db().prepare(`
      INSERT INTO metrics_ram (used_gb, total_gb, free_gb, load_1m, load_5m, load_15m)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      (totalMem - freeMem).toFixed(2),
      totalMem,
      freeMem,
      loadAvg[0].toFixed(2),
      loadAvg[1].toFixed(2),
      loadAvg[2].toFixed(2)
    );
  } catch (err) {
    console.error('[metrics] RAM collect error:', err.message);
  }
}

async function collectBattery() {
  try {
    const { stdout, exitCode } = await execCommand('termux-battery-status', { timeout: 5000 });
    if (exitCode !== 0 || !stdout) return;

    const b = JSON.parse(stdout);
    if (b.percentage === undefined) return;

    db().prepare(`
      INSERT INTO metrics_battery (percentage, status, temperature, voltage, health, cycles)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      b.percentage,
      b.status || 'unknown',
      b.temperature || null,
      b.voltage || null,
      b.health || null,
      b.cycles || null
    );
  } catch (err) {
    // Battery command may not be available — skip silently
  }
}

async function collectStorage() {
  try {
    const { stdout } = await execCommand("df -h 2>/dev/null | grep '^/'", { timeout: 5000 });
    if (!stdout) return;

    const lines = stdout.trim().split('\n').filter(Boolean);
    const insert = db().prepare(`
      INSERT INTO metrics_storage (mount, total_gb, used_gb, avail_gb)
      VALUES (?, ?, ?, ?)
    `);

    for (const line of lines) {
      const parts = line.replace(/\s+/g, ' ').split(' ');
      const mount = parts[parts.length - 1];
      const total = parts[1];
      const used = parts[2];
      const avail = parts[3];

      if (mount && total && used) {
        const toGb = (v) => {
          if (!v || v === '-') return null;
          const num = parseFloat(v);
          if (v.endsWith('G')) return num;
          if (v.endsWith('T')) return num * 1024;
          if (v.endsWith('M')) return num / 1024;
          return num;
        };
        insert.run(mount, toGb(total), toGb(used), toGb(avail));
      }
    }
  } catch (err) {
    console.error('[metrics] Storage collect error:', err.message);
  }
}

function getMetrics(type, { limit = 500, from, to } = {}) {
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push('ts >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('ts <= ?');
    params.push(to);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = db().prepare(`SELECT * FROM ${type} ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
  rows.reverse();

  return rows;
}

module.exports = { startCollector, stopCollector, getMetrics, collectRam, collectBattery, collectStorage };
