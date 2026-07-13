const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const HttpProxy = require('http-proxy');
const archiver = require('archiver');

const PORT = 8080;
const PANEL_PASSWORD = process.env.PANEL_PW || null;
const IDE_PORT = 8085;
const START_DIR = os.homedir();
const BASHRC_PATH = path.join(START_DIR, '.bashrc');
const LINKS_PATH = path.join(__dirname, 'links.json');

const proxy = HttpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
    if (res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('IDE недоступна');
    }
});

// --- Helpers ---

const getDiskSpace = () => {
    return new Promise((resolve) => {
        exec('df -h /data 2>/dev/null', (err, stdout) => {
            if (err || !stdout) return resolve({ total: '-', used: '-' });
            const lines = stdout.trim().split('\n');
            if (lines.length < 2) return resolve({ total: '-', used: '-' });
            const parts = lines[1].replace(/\s+/g, ' ').split(' ');
            resolve({ total: parts[1] || '-', used: parts[2] || '-' });
        });
    });
};

const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
};

const urlParams = (req) => new URL(req.url, `http://${req.headers.host}`).searchParams;

const getBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => resolve(body));
});

const AUTH_COOKIE = 'panel_token';

const checkAuth = (req, res) => {
    if (!PANEL_PASSWORD) return true;
    const token = req.headers['x-panel-pw'] || '';
    return token === PANEL_PASSWORD;
};

const sendUnauthorized = (res) => {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unauthorized');
};

const serveFile = (res, filePath, contentType) => {
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(500); return res.end('Error loading file'); }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
};

const json = (res, data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

const text = (res, data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(data);
};

// --- Handlers ---

async function handleStats(req, res) {
    try {
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const disk = await getDiskSpace();
        const loadAvg = os.loadavg();
        const uptimeSec = os.uptime();
        const interfaces = os.networkInterfaces();
        const netList = [];
        for (const name in interfaces) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4') {
                    netList.push({ name, address: iface.address, internal: iface.internal });
                }
            }
        }
        json(res, {
            ramTotal: totalMem,
            ramUsed: (totalMem - freeMem).toFixed(2),
            ramFree: freeMem,
            diskTotal: disk.total,
            diskUsed: disk.used,
            ip: getLocalIP(),
            uptime: Math.round(uptimeSec / 60),
            uptimeFull: {
                days: Math.floor(uptimeSec / 86400),
                hours: Math.floor((uptimeSec % 86400) / 3600),
                minutes: Math.floor((uptimeSec % 3600) / 60)
            },
            loadAvg: { one: loadAvg[0].toFixed(2), five: loadAvg[1].toFixed(2), fifteen: loadAvg[2].toFixed(2) },
            os: os.type() + ' / ' + os.release(),
            osFull: { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), release: os.release() },
            network: netList
        });
    } catch (e) {
        json(res, { error: e.message }, 500);
    }
}

function handleTunnelLinks(req, res) {
    const panelLogPath = path.join(os.homedir(), 'panel_tunnel.log');
    const ideLogPath = path.join(os.homedir(), 'ide_tunnel.log');
    let panelUrl = 'Генерация...';
    let ideUrl = 'Генерация...';
    if (fs.existsSync(panelLogPath)) {
        const d = fs.readFileSync(panelLogPath, 'utf-8');
        const m = d.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (m.length > 0) panelUrl = m[m.length - 1];
    }
    if (fs.existsSync(ideLogPath)) {
        const d = fs.readFileSync(ideLogPath, 'utf-8');
        const m = d.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
        if (m.length > 0) ideUrl = m[m.length - 1];
    }
    json(res, { panelUrl, ideUrl });
}

function handleFileList(req, res) {
    let targetPath = urlParams(req).get('path');
    if (!targetPath || targetPath.trim() === '') targetPath = START_DIR;
    fs.readdir(targetPath, { withFileTypes: true }, (err, files) => {
        if (err) return json(res, { error: 'Доступ ограничен или это не папка' }, 500);
        const result = files.map(f => {
            try {
                return { name: f.name, isDir: f.isDirectory(), fullPath: targetPath === '/' ? '/' + f.name : path.join(targetPath, f.name) };
            } catch(e) { return null; }
        }).filter(Boolean);
        json(res, { currentPath: targetPath, files: result });
    });
}

function handleFileView(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.readFile(targetPath, 'utf-8', (err, data) => {
        if (err) return text(res, 'Ошибка чтения файла', 500);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
    });
}

async function handleFileSave(req, res) {
    const targetPath = urlParams(req).get('path');
    const body = await getBody(req);
    fs.writeFile(targetPath, body, 'utf-8', (err) => {
        if (err) return text(res, 'Ошибка сохранения', 500);
        text(res, 'Saved');
    });
}

function handleFileDownload(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isFile()) return text(res, 'File not found', 404);
        const fileName = path.basename(targetPath);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="' + fileName + '"',
            'Content-Length': stats.size
        });
        fs.createReadStream(targetPath).pipe(res);
    });
}

async function handleFileUpload(req, res) {
    const targetDir = urlParams(req).get('dir');
    const fileName = urlParams(req).get('name');
    if (!targetDir || !fileName) return text(res, 'Missing dir or name', 400);
    const filePath = path.join(targetDir, fileName);
    const ws = fs.createWriteStream(filePath);
    req.pipe(ws);
    req.on('end', () => json(res, { success: true }));
    req.on('error', () => text(res, 'Upload failed', 500));
}

function handleFileDownloadDir(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isDirectory()) return text(res, 'Directory not found', 404);
        const archiveName = path.basename(targetPath) + '.zip';
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="' + archiveName + '"'
        });
        const archive = new archiver.ZipArchive();
        archive.pipe(res);
        archive.directory(targetPath, false);
        archive.finalize();
    });
}

function handleFileDelete(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.stat(targetPath, (err, stats) => {
        if (err) return text(res, 'Not found', 404);
        const rmCmd = stats.isDirectory() ? 'rm -rf "' + targetPath + '"' : 'rm "' + targetPath + '"';
        exec(rmCmd, (err) => {
            if (err) return text(res, 'Delete failed', 500);
            text(res, 'Deleted');
        });
    });
}

function handleFileMkdir(req, res) {
    const targetPath = urlParams(req).get('path');
    if (!targetPath) return text(res, 'Missing path', 400);
    fs.mkdir(targetPath, { recursive: true }, (err) => {
        if (err) return text(res, 'Mkdir failed', 500);
        text(res, 'Created');
    });
}

function handleFileCreate(req, res) {
    const targetPath = urlParams(req).get('path');
    if (!targetPath) return text(res, 'Missing path', 400);
    fs.writeFile(targetPath, '', 'utf-8', (err) => {
        if (err) return text(res, 'Create failed', 500);
        text(res, 'Created');
    });
}

async function handleLinksStatus(req, res) {
    fs.readFile(LINKS_PATH, 'utf-8', (err, data) => {
        if (err) return json(res, []);
        let links = [];
        try { links = JSON.parse(data); } catch(e) { return json(res, []); }
        const results = links.map(link => {
            const url = link.url.replace(/^https?:\/\//, '');
            return { id: link.id, online: false };
        });
        let completed = 0;
        if (results.length === 0) return json(res, []);
        results.forEach((r, i) => {
            const url = links[i].url;
            exec('curl -o /dev/null -s -w "%{http_code}" --connect-timeout 2 ' + url, { timeout: 5000 }, (err, stdout) => {
                const code = parseInt(stdout.trim());
                r.online = code >= 200 && code < 500;
                completed++;
                if (completed === results.length) json(res, results);
            });
        });
    });
}

async function handleLinksSave(req, res) {
    try {
        const links = JSON.parse(await getBody(req));
        fs.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf-8', (err) => {
            if (err) return json(res, { error: 'Save failed' }, 500);
            json(res, { success: true });
        });
    } catch (e) {
        text(res, 'Invalid JSON', 400);
    }
}

function handleLinksGet(req, res) {
    fs.readFile(LINKS_PATH, 'utf-8', (err, data) => {
        if (err) return json(res, []);
        json(res, JSON.parse(data));
    });
}

function handleAutostartGet(req, res) {
    fs.readFile(BASHRC_PATH, 'utf-8', (err, data) => {
        if (err) return text(res, 'Не удалось прочитать .bashrc', 500);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
    });
}

async function handleAutostartSave(req, res) {
    const body = await getBody(req);
    fs.writeFile(BASHRC_PATH, body, 'utf-8', (err) => {
        if (err) return text(res, 'Не удалось записать .bashrc', 500);
        text(res, 'Saved');
    });
}

function handleProcessList(req, res) {
    exec('ps aux', { timeout: 5000 }, (err, stdout) => {
        if (err) return json(res, { error: 'ps aux failed' }, 500);
        const lines = stdout.trim().split('\n').slice(1); // skip header
        const processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 11) return null;
            return {
                pid: parts[1],
                user: parts[0],
                cpu: parts[2],
                mem: parts[3],
                vsz: parts[4],
                rss: parts[5],
                tty: parts[6],
                stat: parts[7],
                start: parts[8],
                time: parts[9],
                cmd: parts.slice(10).join(' ')
            };
        }).filter(Boolean);
        json(res, processes);
    });
}

let batteryLock = false;
function handleBattery(req, res) {
    if (batteryLock) return json(res, { error: 'busy' }, 429);
    batteryLock = true;
    exec('termux-battery-status', { timeout: 5000 }, (err, stdout) => {
        batteryLock = false;
        exec('pkill -f "termux-api BatteryStatus" 2>/dev/null', () => {});
        if (err) return json(res, { error: 'battery info unavailable' }, 500);
        try { json(res, JSON.parse(stdout)); }
        catch (e) { json(res, { error: 'parse failed' }, 500); }
    });
}

function handleLogs(req, res) {
    const name = urlParams(req).get('name') || 'main-server';
    const lines = urlParams(req).get('lines') || '50';
    const logDir = path.join(__dirname);
    const logFile = path.join(logDir, name + '.log');
    const altLog = path.join(os.homedir(), name + '.log');
    const target = fs.existsSync(logFile) ? logFile : (fs.existsSync(altLog) ? altLog : null);
    if (!target) return json(res, { error: 'log not found' }, 404);
    exec('tail -n ' + parseInt(lines) + ' "' + target + '"', { timeout: 5000 }, (err, stdout) => {
        if (err) return json(res, { error: 'read failed' }, 500);
        text(res, stdout || '(empty)');
    });
}

function handleFileSearch(req, res) {
    const query = urlParams(req).get('query');
    const dir = urlParams(req).get('dir') || os.homedir();
    if (!query || query.trim() === '') return json(res, []);
    const safe = query.replace(/[^a-zA-Z0-9._-]/g, '?');
    exec('find "' + dir + '" -maxdepth 4 -iname "*' + safe + '*" -type f 2>/dev/null | head -50', { timeout: 10000 }, (err, stdout) => {
        const files = stdout.trim().split('\n').filter(Boolean).map(f => ({ fullPath: f, name: f.split('/').pop(), isDir: false }));
        json(res, files);
    });
}

function handleProcessKill(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { pid } = JSON.parse(body);
            if (!pid) return json(res, { error: 'pid required' }, 400);
            exec('kill ' + parseInt(pid), (err) => {
                if (err) return json(res, { error: 'kill failed' }, 500);
                json(res, { success: true });
            });
        } catch (e) {
            json(res, { error: 'invalid request' }, 400);
        }
    });
}

function handleTerminalExec(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { cmd, cwd } = JSON.parse(body);
            if (!cmd || typeof cmd !== 'string') return json(res, { error: 'cmd required' }, 400);
            const opts = { timeout: 30000 };
            if (cwd) opts.cwd = cwd;
            exec(cmd, opts, (err, stdout, stderr) => {
                json(res, { stdout: stdout, stderr: stderr, exitCode: err ? (err.code || 1) : 0 });
            });
        } catch (e) {
            json(res, { error: 'invalid request' }, 400);
        }
    });
}

function handleSystemRestart(req, res) {
    text(res, 'Restarting...');
    const killAndRestartCmd = [
        '( pkill -f "cloudflared"',
        'pkill -f "postgres"',
        'kill -9 $(lsof -t -i:8085) 2>/dev/null',
        'kill -9 $(lsof -t -i:8080) 2>/dev/null',
        'for i in 1 2 3 4 5; do',
        '  fuser 8080/tcp 2>/dev/null || break',
        '  sleep 1',
        'done',
        'source ' + BASHRC_PATH + ' ) &'
    ].join('\n');
    setTimeout(() => exec(killAndRestartCmd, { shell: '/bin/bash' }), 500);
}

// --- Static file maps ---
const staticFiles = {
    '/':             { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/index.html':   { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/style.css':    { file: 'style.css', type: 'text/css; charset=utf-8' },
    '/script.js':    { file: 'script.js', type: 'application/javascript; charset=utf-8' },
};

// --- Router ---
const routes = {
    'POST:/api/login':          handleLogin,
    'GET:/api/battery':         handleBattery,
    'GET:/api/logs':            handleLogs,
    'GET:/api/files/search':    handleFileSearch,
    'GET:/api/processes':       handleProcessList,
    'POST:/api/processes/kill': handleProcessKill,
    'POST:/api/terminal/exec':  handleTerminalExec,
    'GET:/api/stats':            handleStats,
    'GET:/api/tunnel/links':     handleTunnelLinks,
    'GET:/api/files/list':       handleFileList,
    'GET:/api/files/view':       handleFileView,
    'POST:/api/files/save':      handleFileSave,
    'GET:/api/files/download':   handleFileDownload,
    'POST:/api/files/upload':    handleFileUpload,
    'GET:/api/files/download-dir': handleFileDownloadDir,
    'DELETE:/api/files/delete':  handleFileDelete,
    'POST:/api/files/mkdir':     handleFileMkdir,
    'POST:/api/files/create':    handleFileCreate,
    'GET:/api/links/status':    handleLinksStatus,
    'POST:/api/links':           handleLinksSave,
    'GET:/api/links':            handleLinksGet,
    'GET:/api/autostart/get':    handleAutostartGet,
    'POST:/api/autostart/save':  handleAutostartSave,
    'POST:/api/system/restart':  handleSystemRestart,
};

function handleLogin(req, res) {
    let body = '';
    req.on('data', c => body += c.toString());
    req.on('end', () => {
        try {
            const { password } = JSON.parse(body);
            if (password === PANEL_PASSWORD) {
                json(res, { success: true });
            } else {
                json(res, { error: 'wrong password' }, 401);
            }
        } catch (e) {
            json(res, { error: 'invalid request' }, 400);
        }
    });
}

// --- Server ---
const server = http.createServer(async (req, res) => {
    const decodedUrl = decodeURIComponent(req.url);
    const pathname = decodedUrl.split('?')[0];

    // Proxy check (before routing)
    if (pathname.startsWith('/_/') || pathname.startsWith('/vscode-web-dist') || req.headers['x-vscode-proxy-agent']) {
        return proxy.web(req, res, { target: 'http://localhost:' + IDE_PORT });
    }

    // Auth check (skip for login and static files)
    if (PANEL_PASSWORD && pathname.startsWith('/api/') && pathname !== '/api/login') {
        if (!checkAuth(req)) {
            return sendUnauthorized(res);
        }
    }

    // Static files
    const sf = staticFiles[pathname];
    if (sf) return serveFile(res, path.join(__dirname, 'public', sf.file), sf.type);

    // API routes
    const handler = routes[req.method + ':' + pathname];
    if (handler) return handler(req, res);

    // 404
    res.writeHead(404);
    res.end('Not Found');
});

server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head, { target: 'http://localhost:' + IDE_PORT });
});

function startServer(retries = 3) {
    server.listen(PORT, () => {
        console.log('Сервер запущен на порту ' + PORT);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retries > 0) {
            console.log('Порт ' + PORT + ' занят, повтор через 2с (' + retries + ' попыток осталось)');
            server.close();
            setTimeout(() => startServer(retries - 1), 2000);
        } else {
            console.error('Не удалось запустить сервер:', err.message);
        }
    });
}

startServer();
