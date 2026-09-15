const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const { execCommand } = require('../../utils/exec');
const { START_DIR } = require('../../config/constants');
const { logEvent } = require('../../services/events.service');

async function handleFileSearch(req, res) {
    const query = req.query.query;
    let dir = req.query.dir || os.homedir();
    if (!query || query.trim() === '') return res.json([]);
    dir = path.resolve(dir);
    if (!fs.existsSync(dir)) return res.status(400).json({ error: 'Directory not found' });
    const safeDir = dir.replace(/(["\\$`])/g, '\\$1');
    const safe = query.replace(/[^a-zA-Z0-9._-]/g, '?');
    try {
        const { stdout } = await execCommand('find "' + safeDir + '" -maxdepth 4 -iname "*' + safe + '*" -type f 2>/dev/null | head -50', { timeout: 10000 });
        const files = stdout.trim().split('\n').filter(Boolean).map(f => ({ 
            fullPath: f, name: f.split('/').pop(), isDir: false 
        }));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
}

async function handleFileList(req, res) {
    let targetPath = req.query.path;
    if (!targetPath || targetPath.trim() === '') targetPath = START_DIR;
    try {
        const files = await fs.promises.readdir(targetPath, { withFileTypes: true });
        const result = files.map(f => {
            try {
                return { name: f.name, isDir: f.isDirectory(), fullPath: targetPath === '/' ? '/' + f.name : path.join(targetPath, f.name) };
            } catch(e) { return null; }
        }).filter(Boolean);
        res.json({ currentPath: targetPath, files: result });
    } catch (err) {
        res.status(500).json({ error: 'Access denied or not a directory' });
    }
}

async function handleFileView(req, res) {
    const targetPath = req.query.path;
    try {
        const data = await fs.promises.readFile(targetPath, 'utf-8');
        res.type('text/plain; charset=utf-8').send(data);
    } catch (err) {
        res.status(500).send('Ошибка чтения файла');
    }
}

async function handleFileSave(req, res) {
    const targetPath = req.query.path;
    const body = req.body;
    try {
        await fs.promises.writeFile(targetPath, body, 'utf-8');
        logEvent('file_save', { path: targetPath, size: typeof body === 'string' ? body.length : 0 }, 'info', 'actions');
        res.send('Saved');
    } catch (err) {
        logEvent('file_save_error', { path: targetPath, error: err.message }, 'error', 'actions');
        res.status(500).send('Ошибка сохранения');
    }
}

async function handleFileDownload(req, res) {
    const targetPath = req.query.path;
    try {
        const stats = await fs.promises.stat(targetPath);
        if (!stats.isFile()) throw new Error('Not a file');
        const fileName = path.basename(targetPath);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="' + fileName + '"'
        });
        fs.createReadStream(targetPath).pipe(res);
    } catch (err) {
        res.status(404).json({ error: 'File not found' });
    }
}

async function handleFileUpload(req, res) {
    const targetDir = req.query.dir;
    const fileName = req.query.name;
    if (!targetDir || !fileName) return res.status(400).send('Missing dir or name');
    const safeFileName = path.basename(fileName);
    const filePath = path.join(targetDir, safeFileName);
    try {
        await fs.promises.mkdir(targetDir, { recursive: true });
        const ws = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            req.pipe(ws);
            ws.on('finish', resolve);
            ws.on('error', reject);
            req.on('error', reject);
        });
        logEvent('file_upload', { path: filePath }, 'info', 'actions');
        res.json({ success: true });
    } catch (err) {
        logEvent('file_upload_error', { path: filePath, error: err.message }, 'error', 'actions');
        res.status(500).send('Upload failed');
    }
}

async function handleFileDownloadDir(req, res) {
    const targetPath = req.query.path;
    try {
        const stats = await fs.promises.stat(targetPath);
        if (!stats.isDirectory()) throw new Error('Not a directory');
        const archiveName = path.basename(targetPath) + '.zip';
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename="' + archiveName + '"'
        });
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        archive.directory(targetPath, false);
        await archive.finalize();
    } catch (err) {
        res.status(404).send('Directory not found');
    }
}

async function handleFileDelete(req, res) {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).send('Missing path');
    try {
        await fs.promises.stat(targetPath);
        await fs.promises.rm(targetPath, { recursive: true, force: true });
        logEvent('file_delete', { path: targetPath }, 'info', 'actions');
        res.send('Deleted');
    } catch (err) {
        logEvent('file_delete_error', { path: targetPath, error: err.message }, 'error', 'actions');
        res.status(err.code === 'ENOENT' ? 404 : 500).send('Delete failed');
    }
}

async function handleFileMkdir(req, res) {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).send('Missing path');
    try {
        await fs.promises.mkdir(targetPath, { recursive: true });
        logEvent('file_mkdir', { path: targetPath }, 'info', 'actions');
        res.send('Created');
    } catch (err) {
        logEvent('file_mkdir_error', { path: targetPath, error: err.message }, 'error', 'actions');
        res.status(500).send('Mkdir failed');
    }
}

async function handleFileCreate(req, res) {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).send('Missing path');
    try {
        await fs.promises.writeFile(targetPath, '', 'utf-8');
        logEvent('file_create', { path: targetPath }, 'info', 'actions');
        res.send('Created');
    } catch (err) {
        logEvent('file_create_error', { path: targetPath, error: err.message }, 'error', 'actions');
        res.status(500).send('Create failed');
    }
}

router.get('/search', handleFileSearch);
router.get('/list', handleFileList);
router.get('/view', handleFileView);
router.post('/save', handleFileSave);
router.get('/download', handleFileDownload);
router.post('/upload', handleFileUpload);
router.get('/download-dir', handleFileDownloadDir);
router.delete('/delete', handleFileDelete);
router.post('/mkdir', handleFileMkdir);
router.post('/create', handleFileCreate);

module.exports = router;