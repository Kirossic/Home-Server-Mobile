const express = require('express');
const path = require('path');
const os = require('os');
const app = express();
const indexRoutes = require('./routes/index');

const publicDir = path.resolve(__dirname, '../../public'); 

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; 

app.use('/api', (req, res, next) => {
  if (!process.env.PANEL_PW || req.path === '/login') return next();
  const token = req.headers['x-panel-pw'] || '';
  if (token !== process.env.PANEL_PW) return res.status(401).send('Unauthorized');
  next();
});

app.use('/api', indexRoutes);

app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIPv4 && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

app.listen(PORT, HOST, () => {
  const localIp = getLocalIp();
  
  console.log(`Сервер успешно запущен!`);
  console.log('_____________________________________________________________________');
  console.log(`| Локально на устройстве: | http://localhost:${PORT}/                  |`);
  console.log(`| В локальной сети (Wi-Fi):| http://${localIp}:${PORT}/` + ' '.repeat(Math.max(0, 31 - localIp.length)) + '|');
  console.log('|_________________________|_________________________________________|');
});