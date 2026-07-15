const express = require('express');
const router = express.Router();

const { fs, BASHRC_PATH, getBody } = require('./_shared');

function handleAutostartGet(req, res) {
    fs.readFile(BASHRC_PATH, 'utf-8', (err, data) => {
        if (err) return res.status(500).send('Не удалось прочитать .bashrc');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
    });
}

async function handleAutostartSave(req, res) {
    const body = await getBody(req);
    fs.writeFile(BASHRC_PATH, body, 'utf-8', (err) => {
        if (err) return res.status(500).send('Не удалось записать .bashrc');
        res.send('Saved');
    });
}

router.get('/get', handleAutostartGet);
router.post('/save', handleAutostartSave);

module.exports = router;