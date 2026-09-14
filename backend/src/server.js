const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const app = express();
const indexRoutes = require('./routes/index');
const { PORT, HOST, PANEL_PASSWORD } = require('./config/constants');
const { getLocalIP } = require('./utils/system');
const { initDatabase } = require('./config/database');
const { startCollector } = require('./services/metrics-collector');
const { startPolling } = require('./services/telegram.service');
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
    };

    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('exit', cleanup);
  } catch (err) {
    console.warn('[server] Ошибка инициализации PID-замка:', err.message);
  }
}

handleSingleInstance();

app.use('/api', (req, res, next) => {
  if (!PANEL_PASSWORD || req.path === '/login') return next();
  const token = req.headers['x-panel-pw'] || '';
  if (token !== PANEL_PASSWORD) return res.status(401).send('Unauthorized');
  next();
});
app.use(express.json());
app.use(express.text({ type: ['text/*', 'application/x-sh'], limit: '10mb' }));
app.use('/api', indexRoutes);
app.use(express.static(publicDir));
app.use((err, req, res, next) => {
  console.error(`[error] ${err.method} ${err.url}:`, err.message);
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