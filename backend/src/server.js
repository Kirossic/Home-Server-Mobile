const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const app = express();
const indexRoutes = require('./routes/index');
const { PORT, HOST, PANEL_PASSWORD } = require('./config/constants');
const { getLocalIP } = require('./utils/system');
const { initDatabase, flushDb } = require('./config/database');
const { startCollector } = require('./services/metrics-collector');
const { startPolling } = require('./services/telegram.service');
const { logEvent, logHttpAccess } = require('./services/events.service');
const publicDir = path.resolve(__dirname, '../../public'); 

// --- Single Instance PID Lock ---
const pidFile = path.resolve(__dirname, '../../data/main-server.pid');

function handleSingleInstance() {
  try {
    const dir = path.dirname(pidFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(pidFile)) {
      const existingPid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
      if (existingPid && !isNaN(existingPid) && existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0); // Проверка: запущен ли процесс
          console.warn(`[server] Другой экземпляр панели уже запущен с PID ${existingPid}. Завершение.`);
          process.exit(0);
        } catch (e) {
          // Stale PID file, процесс не существует
        }
      }
    }

    fs.writeFileSync(pidFile, process.pid.toString(), 'utf-8');

    const cleanup = () => {
      try {
        if (fs.existsSync(pidFile)) {
          const current = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
          if (current === process.pid) {
            fs.unlinkSync(pidFile);
          }
        }
      } catch (e) {}
      flushDb();
    };

    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('exit', cleanup);
  } catch (err) {
    console.warn('[server] Ошибка инициализации PID-замка:', err.message);
  }
}

handleSingleInstance();

// --- Global Exception Logging ---
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err.message, err.stack);
  try {
    logEvent('uncaught_exception', { error: err.message, stack: err.stack }, 'error', 'system');
    const { sendSecurityAlert } = require('./services/telegram.service');
    sendSecurityAlert('server_error', { name: 'Uncaught Exception', message: err.message });
  } catch (e) {}
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
  try {
    logEvent('unhandled_rejection', { reason: String(reason) }, 'error', 'system');
    const { sendSecurityAlert } = require('./services/telegram.service');
    sendSecurityAlert('server_error', { name: 'Unhandled Rejection', message: String(reason) });
  } catch (e) {}
});

// --- HTTP Access Audit Middleware ---
app.use('/api', (req, res, next) => {
  const start = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const userAgent = req.headers['user-agent'] || '';

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Skip logging high-frequency link polling to avoid database spam
    if (req.path === '/tunnel/links' && res.statusCode === 200) return;

    logHttpAccess({
      ip,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: duration,
      user_agent: userAgent.slice(0, 150)
    });
  });
  next();
});

// --- Auth Middleware ---
app.use('/api', (req, res, next) => {
  if (!PANEL_PASSWORD || req.path === '/login') return next();
  const token = req.headers['x-panel-pw'] || '';
  if (token !== PANEL_PASSWORD) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    logEvent('auth_unauthorized', { ip, path: req.path }, 'warn', 'security');
    try {
      const { sendSecurityAlert } = require('./services/telegram.service');
      sendSecurityAlert('auth_failed', { ip, path: req.path });
    } catch (e) {}
    return res.status(401).send('Unauthorized');
  }
  next();
});

app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/x-sh'], limit: '10mb' }));
app.use('/api', indexRoutes);
app.use(express.static(publicDir));

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error(`[error] ${err.method || req.method} ${err.url || req.url}:`, err.message);
  try {
    logEvent('http_500_error', { method: req.method, url: req.originalUrl || req.url, error: err.message }, 'error', 'http');
  } catch (e) {}
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

initDatabase().then(() => {
  startCollector();
  startPolling();
  const server = app.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log(`Сервер успешно запущен!`);
    console.log('_____________________________________________________________________');
    console.log(`| Локально на устройстве: | http://localhost:${PORT}/                  |`);
    console.log(`| В локальной сети (Wi-Fi):| http://${localIP}:${PORT}/` + ' '.repeat(Math.max(0, 31 - localIP.length)) + '|');
    console.log('|_________________________|_________________________________________|');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Критическая ошибка: Порт ${PORT} уже занят другим процессом! Завершение.`);
      process.exit(1);
    }
    console.error('[server] Ошибка веб-сервера:', err);
    process.exit(1);
  });
}).catch(err => {
  console.error('[server] Failed to initialize database:', err.message);
  process.exit(1);
});