const path = require('path');
const { PROJECTS_DIR, PG_DIR } = require('./constants');

const SERVICES = {
  bukings: {
    id: 'bukings',
    label: 'Bukings',
    desc: 'Сервис бронирования (порт 3000)',
    icon: '📅',
    startCmd: 'cd ' + path.join(PROJECTS_DIR, 'Bukings') + ' && setsid node backend/src/server.js > ~/Bukings-server.log 2>&1 &',
    stopCmd: 'pkill -f "node backend/src/server.js"',
    checkCmd: 'pgrep -f "node backend/src/server.js" >/dev/null 2>&1',
  },
  postgresql: {
    id: 'postgresql',
    label: 'PostgreSQL',
    desc: 'База данных PostgreSQL (порт 5432)',
    icon: '📄',
    startCmd: 'pg_ctl -D ' + PG_DIR + ' -l ' + PG_DIR + '/logfile start',
    stopCmd: 'pg_ctl -D ' + PG_DIR + ' stop',
    checkCmd: 'pg_isready -h localhost -p 5432 >/dev/null 2>&1',
  },
};

const SERVICE_AUTOSTART = {
  bukings: [
    '#service-bukings',
    'if ! fuser 3000/tcp >/dev/null 2>&1 && [ -d "' + path.join(PROJECTS_DIR, 'Bukings') + '" ]; then',
    '    cd ' + path.join(PROJECTS_DIR, 'Bukings') + ' && setsid node backend/src/server.js > ~/Bukings-server.log 2>&1 &',
    '    cd ~',
    'fi',
    '#/service-bukings',
  ].join('\n'),
  postgresql: [
    '#service-postgresql',
    'if ! pg_isready >/dev/null 2>&1; then',
    '    pg_ctl -D ' + PG_DIR + ' -l ' + PG_DIR + '/logfile start',
    'fi',
    '#/service-postgresql',
  ].join('\n'),
};

module.exports = {
  SERVICES,
  SERVICE_AUTOSTART,
};