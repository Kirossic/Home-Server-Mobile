const os = require('os');
const { getDb } = require('../config/database');
const { execCommand } = require('../utils/exec');
const { getDiskSpace } = require('../utils/system');
const { logEvent } = require('./events.service');
const { startMaintenanceSchedule } = require('./maintenance.service');

let intervals = [];

function startCollector() {
  logEvent('server_start', { uptime: os.uptime(), hostname: os.hostname() });

  cleanupOldMetrics();
  startMaintenanceSchedule();

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

function cleanupOldMetrics() {
  try {
    const db = getDb();
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/apex/%'");
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/bootstrap-apex/%'");
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/system/%'");
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/vendor/%'");
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/product/%'");
    db.run("DELETE FROM metrics_storage WHERE mount = '/'");
    console.log('[metrics] Cleaned up old storage entries');
  } catch (err) {
    console.error('[metrics] Cleanup error:', err.message);
  }
}

function collectRam() {
  try {
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const loadAvg = os.loadavg();

    getDb().run(
      `INSERT INTO metrics_ram (used_gb, total_gb, free_gb, load_1m, load_5m, load_15m)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        (totalMem - freeMem).toFixed(2),
        totalMem,
        freeMem,
        loadAvg[0].toFixed(2),
        loadAvg[1].toFixed(2),
        loadAvg[2].toFixed(2)
      ]
    );
  } catch (err) {
    console.error('[metrics] RAM collect error:', err.message);
  }
}

let lastPluggedState = null;
let lastHighTempAlertTime = 0;

async function collectBattery() {
  try {
    const { stdout, exitCode } = await execCommand('termux-battery-status', { timeout: 5000 });
    if (exitCode !== 0 || !stdout) return;

    const b = JSON.parse(stdout);
    if (b.percentage === undefined) return;

    // Check for power disconnection
    if (b.plugged) {
      if (lastPluggedState && lastPluggedState !== 'UNPLUGGED' && b.plugged === 'UNPLUGGED') {
        try {
          const { sendSecurityAlert } = require('./telegram.service');
          sendSecurityAlert('power_disconnected', { percentage: b.percentage, status: b.status });
        } catch (e) {}
      }
      lastPluggedState = b.plugged;
    }

    // Check for overheat (> 44°C) with 10 min cooldown
    if (b.temperature && b.temperature >= 44 && (Date.now() - lastHighTempAlertTime > 600000)) {
      lastHighTempAlertTime = Date.now();
      try {
        const { sendSecurityAlert } = require('./telegram.service');
        sendSecurityAlert('battery_temp_high', { temperature: b.temperature, percentage: b.percentage });
      } catch (e) {}
    }

    getDb().run(
      `INSERT INTO metrics_battery (percentage, status, temperature, voltage, health, cycles)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [b.percentage, b.status || 'unknown', b.temperature || null, b.voltage || null, b.health || null, b.cycles || null]
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
    const db = getDb();

    const SKIP_MOUNTS = [
      '/', '/apex', '/bootstrap-apex', '/system', '/vendor',
      '/product', '/mnt', '/odm', '/cust', '/dev', '/sys', '/proc'
    ];

    for (const line of lines) {
      const parts = line.replace(/\s+/g, ' ').split(' ');
      const mount = parts[parts.length - 1];
      const total = parts[1];
      const used = parts[2];
      const avail = parts[3];

      if (!mount || !total || !used) continue;

      if (SKIP_MOUNTS.some(p => mount === p || mount.startsWith(p + '/'))) continue;

      const toGb = (v) => {
        if (!v || v === '-') return null;
        const num = parseFloat(v);
        if (v.endsWith('G')) return num;
        if (v.endsWith('T')) return num * 1024;
        if (v.endsWith('M')) return num / 1024;
        return num;
      };

      const totalGb = toGb(total);
      const usedGb = toGb(used);
      const availGb = toGb(avail);

      if (totalGb === null || usedGb === null) continue;
      if (totalGb === 0) continue;
      if (usedGb > totalGb * 5) continue;

      db.run('INSERT INTO metrics_storage (mount, total_gb, used_gb, avail_gb) VALUES (?, ?, ?, ?)',
        [mount, totalGb, usedGb, availGb]);
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
  const rows = getDb().all(`SELECT * FROM ${type} ${where} ORDER BY id DESC LIMIT ?`, [...params, limit]);
  rows.reverse();
  return rows;
}

module.exports = { startCollector, stopCollector, getMetrics, collectRam, collectBattery, collectStorage };
