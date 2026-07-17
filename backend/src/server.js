const express = require('express');
const path = require('path');
const os = require('os');
const app = express();
const indexRoutes = require('./routes/index');
const { PORT, HOST, PANEL_PASSWORD } = require('./config/constants');
const getLocalIp = require('./utils/getLocalIp');
const publicDir = path.resolve(__dirname, '../../public'); 

app.use('/api', (req, res, next) => {
  if (!PANEL_PASSWORD || req.path === '/login') return next();
  const token = req.headers['x-panel-pw'] || '';
  if (token !== PANEL_PASSWORD) return res.status(401).send('Unauthorized');
  next();
});
app.use(express.json());
app.use('/api', indexRoutes);
app.use(express.static(publicDir));
app.use((err, req, res, next) => {
  console.error(`[error] ${err.method} ${err.url}:`, err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, HOST, () => {
  const localIp = getLocalIp();
  
  console.log(`Сервер успешно запущен!`);
  console.log('_____________________________________________________________________');
  console.log(`| Локально на устройстве: | http://localhost:${PORT}/                  |`);
  console.log(`| В локальной сети (Wi-Fi):| http://${localIp}:${PORT}/` + ' '.repeat(Math.max(0, 31 - localIp.length)) + '|');
  console.log('|_________________________|_________________________________________|');
});