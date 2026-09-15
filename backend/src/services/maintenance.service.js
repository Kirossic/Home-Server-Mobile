const { getDb, vacuumDb, getDbSize } = require('../config/database');
const { logEvent } = require('./events.service');

let maintenanceInterval = null;

async function runMaintenance() {
  const db = getDb();
  const startSize = getDbSize();
  console.log(`[maintenance] Запуск оптимизации БД. Текущий размер: ${startSize.sizeFormatted}`);

  const countsBefore = {
    ram: (db.get('SELECT COUNT(*) as c FROM metrics_ram') || {}).c || 0,
    battery: (db.get('SELECT COUNT(*) as c FROM metrics_battery') || {}).c || 0,
    storage: (db.get('SELECT COUNT(*) as c FROM metrics_storage') || {}).c || 0,
    events: (db.get('SELECT COUNT(*) as c FROM events') || {}).c || 0,
    http: (db.get('SELECT COUNT(*) as c FROM http_logs') || {}).c || 0,
  };

  try {
    // 1. Auto-archive any completed months into cold storage BEFORE purging old data
    try {
      const { autoArchiveCompletedMonths } = require('./archive.service');
      await autoArchiveCompletedMonths();
    } catch (e) {
      console.error('[maintenance] Ошибка авто-архивации месяцев:', e.message);
    }

    // 2. Roll-up RAM metrics older than 3 days into hourly averages
    db.run("DROP TABLE IF EXISTS ram_rollup;");
    db.run(`
      CREATE TEMP TABLE ram_rollup AS
      SELECT 
        strftime('%Y-%m-%d %H:00:00', ts) as hour_ts,
        ROUND(AVG(used_gb), 2) as avg_used,
        ROUND(AVG(total_gb), 2) as avg_total,
        ROUND(AVG(free_gb), 2) as avg_free,
        ROUND(AVG(load_1m), 2) as avg_load_1m,
        ROUND(AVG(load_5m), 2) as avg_load_5m,
        ROUND(AVG(load_15m), 2) as avg_load_15m
      FROM metrics_ram
      WHERE ts < datetime('now', 'localtime', '-3 days')
      GROUP BY hour_ts;
    `);
    db.run("DELETE FROM metrics_ram WHERE ts < datetime('now', 'localtime', '-3 days');");
    db.run(`
      INSERT INTO metrics_ram (ts, used_gb, total_gb, free_gb, load_1m, load_5m, load_15m)
      SELECT hour_ts, avg_used, avg_total, avg_free, avg_load_1m, avg_load_5m, avg_load_15m
      FROM ram_rollup;
    `);
    db.run("DROP TABLE IF EXISTS ram_rollup;");
    db.run("DELETE FROM metrics_ram WHERE ts < datetime('now', 'localtime', '-30 days');");

    // 3. Roll-up Battery metrics older than 3 days into hourly averages
    db.run("DROP TABLE IF EXISTS battery_rollup;");
    db.run(`
      CREATE TEMP TABLE battery_rollup AS
      SELECT 
        strftime('%Y-%m-%d %H:00:00', ts) as hour_ts,
        ROUND(AVG(percentage)) as avg_pct,
        status,
        ROUND(AVG(temperature), 1) as avg_temp,
        ROUND(AVG(voltage)) as avg_volt,
        health,
        MAX(cycles) as max_cycles
      FROM metrics_battery
      WHERE ts < datetime('now', 'localtime', '-3 days')
      GROUP BY hour_ts;
    `);
    db.run("DELETE FROM metrics_battery WHERE ts < datetime('now', 'localtime', '-3 days');");
    db.run(`
      INSERT INTO metrics_battery (ts, percentage, status, temperature, voltage, health, cycles)
      SELECT hour_ts, avg_pct, status, avg_temp, avg_volt, health, max_cycles
      FROM battery_rollup;
    `);
    db.run("DROP TABLE IF EXISTS battery_rollup;");
    db.run("DELETE FROM metrics_battery WHERE ts < datetime('now', 'localtime', '-30 days');");

    // 4. Roll-up Storage metrics older than 3 days into hourly averages per mount
    db.run("DROP TABLE IF EXISTS storage_rollup;");
    db.run(`
      CREATE TEMP TABLE storage_rollup AS
      SELECT 
        strftime('%Y-%m-%d %H:00:00', ts) as hour_ts,
        mount,
        ROUND(AVG(total_gb), 2) as avg_total,
        ROUND(AVG(used_gb), 2) as avg_used,
        ROUND(AVG(avail_gb), 2) as avg_avail
      FROM metrics_storage
      WHERE ts < datetime('now', 'localtime', '-3 days')
      GROUP BY hour_ts, mount;
    `);
    db.run("DELETE FROM metrics_storage WHERE ts < datetime('now', 'localtime', '-3 days');");
    db.run(`
      INSERT INTO metrics_storage (ts, mount, total_gb, used_gb, avail_gb)
      SELECT hour_ts, mount, avg_total, avg_used, avg_avail
      FROM storage_rollup;
    `);
    db.run("DROP TABLE IF EXISTS storage_rollup;");
    db.run("DELETE FROM metrics_storage WHERE ts < datetime('now', 'localtime', '-30 days');");
    db.run("DELETE FROM metrics_storage WHERE mount LIKE '/apex/%' OR mount LIKE '/bootstrap-apex/%' OR mount LIKE '/system/%' OR mount LIKE '/vendor/%' OR mount LIKE '/product/%' OR mount = '/';");

    // 5. Purge old Events: info older than 14 days, warn/error older than 30 days
    db.run("DELETE FROM events WHERE level = 'info' AND ts < datetime('now', 'localtime', '-14 days');");
    db.run("DELETE FROM events WHERE ts < datetime('now', 'localtime', '-30 days');");

    // 6. Purge HTTP logs older than 7 days
    db.run("DELETE FROM http_logs WHERE ts < datetime('now', 'localtime', '-7 days');");

    // 7. Run VACUUM & flush immediately
    const endSize = vacuumDb();

    const countsAfter = {
      ram: (db.get('SELECT COUNT(*) as c FROM metrics_ram') || {}).c || 0,
      battery: (db.get('SELECT COUNT(*) as c FROM metrics_battery') || {}).c || 0,
      storage: (db.get('SELECT COUNT(*) as c FROM metrics_storage') || {}).c || 0,
      events: (db.get('SELECT COUNT(*) as c FROM events') || {}).c || 0,
      http: (db.get('SELECT COUNT(*) as c FROM http_logs') || {}).c || 0,
    };

    const stats = {
      startSize: startSize.sizeFormatted,
      endSize: endSize.sizeFormatted,
      freedBytes: Math.max(0, startSize.sizeBytes - endSize.sizeBytes),
      ramCompressed: countsBefore.ram - countsAfter.ram,
      batteryCompressed: countsBefore.battery - countsAfter.battery,
      storageCompressed: countsBefore.storage - countsAfter.storage,
      currentCounts: countsAfter,
    };

    console.log(`[maintenance] Оптимизация завершена успешно. Было: ${stats.startSize}, стало: ${stats.endSize}. Строк RAM сжато: ${stats.ramCompressed}`);

    logEvent('db_maintenance', stats, 'info', 'system');
    return stats;
  } catch (err) {
    console.error('[maintenance] Ошибка во время оптимизации базы:', err.message);
    logEvent('db_maintenance_error', { error: err.message }, 'error', 'system');
    throw err;
  }
}

function startMaintenanceSchedule() {
  if (maintenanceInterval) clearInterval(maintenanceInterval);

  // Warmup run after 30 seconds
  setTimeout(() => {
    runMaintenance().catch(e => console.error('[maintenance] Ошибка первого запуска:', e.message));
  }, 30000);

  // Periodic run every 24 hours
  maintenanceInterval = setInterval(() => {
    runMaintenance().catch(e => console.error('[maintenance] Ошибка периодического запуска:', e.message));
  }, 24 * 60 * 60 * 1000);

  console.log('[maintenance] Планировщик оптимизации БД активирован (период: 24ч)');
}

module.exports = {
  runMaintenance,
  startMaintenanceSchedule
};
