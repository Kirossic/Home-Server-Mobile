const express = require('express');
const app = express();
const path = require('path');
const indexRouter = require('./routes/index.js');

const publicDir = path.resolve(__dirname, '../../public');

app.use('/api', (req, res, next) => {
  if (!process.env.PANEL_PW || req.path === '/login') {
    return next();
  }

  const token = req.headers['x-panel-pw'] || '';
  if (token !== process.env.PANEL_PW) {
    return res.status(401).send('Unauthorized');
  }

  next();
});

app.use('/api', indexRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 8080;

app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('|_______________________|___________________________________________|');
  console.log(`|Страница сайта:        |http://localhost:${PORT}/                     |`);
  console.log('|_______________________|___________________________________________|');
})