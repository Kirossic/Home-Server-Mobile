const path = require('path');
const { PROJECTS_DIR, PG_DIR } = require('./constants');

const SERVICES = {
  cloudflared: {
    id: 'cloudflared',
    label: 'Cloudflare Tunnels',
    desc: 'Внешний доступ: Панель (8080) и IDE (8085)',
    icon: '🌐',
    startCmd: 'nohup cloudflared tunnel --config /dev/null --url http://localhost:8080 > ~/panel_tunnel.log 2>&1 & nohup cloudflared tunnel --config /dev/null --url http://localhost:8085 > ~/ide_tunnel.log 2>&1 &',
    stopCmd: 'pkill -f "cloudflared tunnel"',
    checkCmd: 'pgrep -f "cloudflared tunnel" >/dev/null 2>&1',
  },
  bukings: {
    id: 'bukings',
    label: 'Bukings',
    desc: 'Сервис бронирования (порт 3000)',
    icon: '📅',
    startCmd: 'cd ' + path.join(PROJECTS_DIR, 'Bukings') + ' && nohup node ' + path.join(PROJECTS_DIR, 'Bukings', 'backend', 'src', 'server.js') + ' > ~/Bukings-server.log 2>&1 &',
    stopCmd: 'pkill -f "Bukings.*server.js"',
    checkCmd: 'pgrep -f "Bukings.*server.js" >/dev/null 2>&1',
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
  'tunnel-watchdog': {
    id: 'tunnel-watchdog',
    label: 'Tunnel Watchdog',
    desc: 'Отказоустойчивый сторож туннелей (проверка 60с, авторестарт)',
    icon: '🐕',
    startCmd: 'nohup node ' + path.join(PROJECTS_DIR, 'main-server', 'backend', 'src', 'services', 'tunnel-watchdog.js') + ' > ~/tunnel_watchdog.log 2>&1 &',
    stopCmd: 'pkill -f "tunnel-watchdog.js"',
    checkCmd: 'pgrep -f "tunnel-watchdog.js" >/dev/null 2>&1',
  },
};

const SERVICE_AUTOSTART = {
  cloudflared: [
    '#service-cloudflared',
    'if ! pgrep -f "cloudflared tunnel --config /dev/null --url http://localhost:8080" > /dev/null 2>&1; then',
    '    > ~/panel_tunnel.log',
    '    nohup cloudflared tunnel --config /dev/null --url http://localhost:8080 > ~/panel_tunnel.log 2>&1 &',
    'fi',
    'if ! pgrep -f "cloudflared tunnel --config /dev/null --url http://localhost:8085" > /dev/null 2>&1; then',
    '    > ~/ide_tunnel.log',
    '    nohup cloudflared tunnel --config /dev/null --url http://localhost:8085 > ~/ide_tunnel.log 2>&1 &',
    'fi',
    '#/service-cloudflared',
  ].join('\n'),
  'tunnel-watchdog': [
    '#service-tunnel-watchdog',
    'if ! pgrep -f "tunnel-watchdog.js" >/dev/null 2>&1; then',
    '    nohup node ' + path.join(PROJECTS_DIR, 'main-server', 'backend', 'src', 'services', 'tunnel-watchdog.js') + ' > ~/tunnel_watchdog.log 2>&1 &',
    'fi',
    '#/service-tunnel-watchdog',
  ].join('\n'),
  bukings: [
    '#service-bukings',
    'if ! pgrep -f "Bukings.*server.js" >/dev/null 2>&1 && [ -d "' + path.join(PROJECTS_DIR, 'Bukings') + '" ]; then',
    '    cd ' + path.join(PROJECTS_DIR, 'Bukings') + ' && nohup node ' + path.join(PROJECTS_DIR, 'Bukings', 'backend', 'src', 'server.js') + ' > ~/Bukings-server.log 2>&1 &',
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