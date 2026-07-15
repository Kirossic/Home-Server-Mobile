const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const archiver = require('archiver');

const START_DIR = os.homedir();
const BASHRC_PATH = path.join(START_DIR, '.bashrc');
const LINKS_PATH = path.resolve(__dirname, '../../../../links.json');
const PROJECTS_DIR = path.join(START_DIR, 'projects');
const PG_DIR = path.join(os.homedir(), '..', 'usr', 'var', 'lib', 'postgresql');

const urlParams = (req) => new URL(req.url, `http://${req.headers.host}`).searchParams;

const getBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
});

const getDiskSpace = () => new Promise((resolve) => {
    exec('df -h /data 2>/dev/null', (err, stdout) => {
        if (err || !stdout) return resolve({ total: '-', used: '-' });
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return resolve({ total: '-', used: '-' });
        const parts = lines[1].replace(/\s+/g, ' ').split(' ');
        resolve({ total: parts[1] || '-', used: parts[2] || '-' });
    });
});

const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
};

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
    fs,
    path,
    os,
    exec,
    archiver,
    START_DIR,
    BASHRC_PATH,
    LINKS_PATH,
    PG_DIR,
    SERVICES,
    SERVICE_AUTOSTART,
    urlParams,
    getBody,
    getDiskSpace,
    getLocalIP,
};