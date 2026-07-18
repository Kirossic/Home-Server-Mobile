const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const { execCommand } = require('../../utils/exec');
const { START_DIR } = require('../../config/constants');

async function handleFileSearch(req, res) {
    const query = req.query.query;
    const dir = req.query.dir || os.homedir();
    if (!query || query.trim() === '') return res.json([]);
    const safe = query.replace(/[^a-zA-Z0-9._-]/g, '?');
    try {
        const { stdout } = await execCommand('find "' + dir + '" -maxdepth 4 -iname "*' + safe + '*" -type f 2>/dev/null | head -50', { timeout: 10000 });
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
        res.send('Saved');
    } catch (err) {
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
    const filePath = path.join(targetDir, fileName);
    try {
        await fs.promises.mkdir(targetDir, { recursive: true });
        const ws = fs.createWriteStream(filePath);
        req.pipe(ws);
        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });
        res.json({ success: true });
    } catch (err) {
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

function handleFileDelete(req, res) {
    const targetPath = req.query.path;
    fs.stat(targetPath, (err, stats) => {
        if (err) return res.status(404).send('Not found');
        const rmCmd = stats.isDirectory() ? 'rm -rf "' + targetPath + '"' : 'rm "' + targetPath + '"';
        execCommand(rmCmd, (err) => {
            if (err) return res.status(500).send('Delete failed');
            res.send('Deleted');
        });
    });
}

function handleFileMkdir(req, res) {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).send('Missing path');
    fs.mkdir(targetPath, { recursive: true }, (err) => {
        if (err) return res.status(500).send('Mkdir failed');
        res.send('Created');
    });
}

function handleFileCreate(req, res) {
    const targetPath = req.query.path;
    if (!targetPath) return res.status(400).send('Missing path');
    fs.writeFile(targetPath, '', 'utf-8', (err) => {
        if (err) return res.status(500).send('Create failed');
        res.send('Created');
    });
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