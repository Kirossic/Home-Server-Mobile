const express = require('express');
const router = express.Router();
const fs = require('fs').promises; // Используем Promise-версию fs
const { LINKS_PATH } = require('../../config/constants');
const { logEvent } = require('../../services/events.service');

// Вспомогательная функция безопасного чтения JSON
async function readLinksFile() {
    try {
        const data = await fs.readFile(LINKS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

async function handleLinksStatus(req, res) {
    const links = await readLinksFile();
    if (!links.length) return res.json([]);

    // Безопасная асинхронная проверка через native fetch с таймаутом
    const statusResults = await Promise.all(links.map(async (link) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(link.url, {
                method: 'HEAD', // HEAD запрос быстрее, так как не скачивает тело ответа
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return { id: link.id, online: response.status >= 200 && response.status < 500 };
        } catch (error) {
            // Если таймаут или ошибка сети — сервис offline
            return { id: link.id, online: false };
        }
    }));

    res.json(statusResults);
}

async function handleLinksSave(req, res) {
    try {
        const links = req.body;
        await fs.writeFile(LINKS_PATH, JSON.stringify(links, null, 2), 'utf-8');
        logEvent('links_saved', { count: links.length });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Save failed' });
    }
}

async function handleLinksGet(req, res) {
    const links = await readLinksFile();
    res.json(links);
}

router.get('/status', handleLinksStatus);
router.post('/', handleLinksSave);
router.get('/', handleLinksGet);

module.exports = router;