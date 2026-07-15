const express = require('express');
const router = express.Router();

const { fs, exec, LINKS_PATH, getBody } = require('./_shared');

async function handleLinksStatus(req, res) {
    fs.readFile(LINKS_PATH, 'utf-8', (err, data) => {
        if (err) return res.json([]);
        let links = [];
        try { links = JSON.parse(data); } catch(e) { return res.json([]); }
        const results = links.map(link => {
            const url = link.url.replace(/^https?:\/\//, '');
            return { id: link.id, online: false };
        });
        let completed = 0;
        if (results.length === 0) return res.json([]);
        results.forEach((r, i) => {
            const url = links[i].url;
            exec('curl -o /dev/null -s -w "%{http_code}" --connect-timeout 2 ' + url, { timeout: 5000 }, (err, stdout) => {
                const code = parseInt(stdout.trim());
                r.online = code >= 200 && code < 500;
                completed++;
                if (completed === results.length) res.json(results);
            });
        });
    });
}

async function handleLinksSave(req, res) {
    try {
        const links = JSON.parse(await getBody(req));
        fs.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf-8', (err) => {
            if (err) return res.status(500).json({ error: 'Save failed' });
            res.json({ success: true });
        });
    } catch (e) {
        res.status(400).send('Invalid JSON');
    }
}

function handleLinksGet(req, res) {
    fs.readFile(LINKS_PATH, 'utf-8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
}

router.get('/status', handleLinksStatus);
router.post('/', handleLinksSave);
router.get('/', handleLinksGet);

module.exports = router;