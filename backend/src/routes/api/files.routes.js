const express = require('express');
const router = express.Router();

const { fs, path, os, exec, archiver, START_DIR, urlParams, getBody } = require('./_shared');

function handleFileSearch(req, res) {
    const query = urlParams(req).get('query');
    const dir = urlParams(req).get('dir') || os.homedir();
    if (!query || query.trim() === '') return res.json([]);
    const safe = query.replace(/[^a-zA-Z0-9._-]/g, '?');
    exec('find "' + dir + '" -maxdepth 4 -iname "*' + safe + '*" -type f 2>/dev/null | head -50', { timeout: 10000 }, (err, stdout) => {
        if (err) return res.status(500).json({ error: 'Search failed' });
        const files = stdout.trim().split('\n').filter(Boolean).map(f => ({ fullPath: f, name: f.split('/').pop(), isDir: false }));
        res.json(files);
    });
}

function handleFileList(req, res) {
    let targetPath = urlParams(req).get('path');
    if (!targetPath || targetPath.trim() === '') targetPath = START_DIR;
    fs.readdir(targetPath, { withFileTypes: true }, (err, files) => {
        if (err) return res.status(500).json({ error: 'Доступ ограничен или это не папка' });
        const result = files.map(f => {
            try {
                return { name: f.name, isDir: f.isDirectory(), fullPath: targetPath === '/' ? '/' + f.name : path.join(targetPath, f.name) };
            } catch(e) { return null; }
        }).filter(Boolean);
        res.json({ currentPath: targetPath, files: result });
    });
}

function handleFileView(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.readFile(targetPath, 'utf-8', (err, data) => {
        if (err) return res.status(500).send('Ошибка чтения файла');
        res.type('text/plain; charset=utf-8').send(data);
    });
}

async function handleFileSave(req, res) {
    const targetPath = urlParams(req).get('path');
    const body = await getBody(req);
    fs.writeFile(targetPath, body, 'utf-8', (err) => {
        if (err) return res.status(500).send('Ошибка сохранения');
        res.send('Saved');
    });
}

function handleFileDownload(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isFile()) return res.status(404).json({ error: 'File not found' });
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
    if (!targetDir || !fileName) return res.status(400).send('Missing dir or name');
    const filePath = path.join(targetDir, fileName);
    const ws = fs.createWriteStream(filePath);
    req.pipe(ws);
    req.on('end', () => res.json({ success: true }));
    req.on('error', () => res.status(500).send('Upload failed'));
}

function handleFileDownloadDir(req, res) {
    const targetPath = urlParams(req).get('path');
    fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isDirectory()) return res.status(404).send('Directory not found');
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
        if (err) return res.status(404).send('Not found');
        const rmCmd = stats.isDirectory() ? 'rm -rf "' + targetPath + '"' : 'rm "' + targetPath + '"';
        exec(rmCmd, (err) => {
            if (err) return res.status(500).send('Delete failed');
            res.send('Deleted');
        });
    });
}

function handleFileMkdir(req, res) {
    const targetPath = urlParams(req).get('path');
    if (!targetPath) return res.status(400).send('Missing path');
    fs.mkdir(targetPath, { recursive: true }, (err) => {
        if (err) return res.status(500).send('Mkdir failed');
        res.send('Created');
    });
}

function handleFileCreate(req, res) {
    const targetPath = urlParams(req).get('path');
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