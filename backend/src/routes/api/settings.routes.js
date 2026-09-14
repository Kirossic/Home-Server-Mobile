const express = require('express');
const router = express.Router();
const { getPublicTelegramSettings, saveTelegramSettings } = require('../../services/settings.service');
const { sendTelegramMessage, restartPolling } = require('../../services/telegram.service');
const { logEvent } = require('../../services/events.service');

router.get('/telegram', (req, res) => {
    try {
        const data = getPublicTelegramSettings();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/telegram', (req, res) => {
    try {
        const { enabled, botToken, chatId, notifyOnTunnelRestart } = req.body;
        const updated = saveTelegramSettings({ enabled, botToken, chatId, notifyOnTunnelRestart });
        restartPolling();
        logEvent('settings_telegram_update', { enabled: updated.enabled, notify: updated.notifyOnTunnelRestart }, 'info', 'actions');
        res.json({ success: true, settings: updated });
    } catch (e) {
        logEvent('settings_telegram_error', { error: e.message }, 'error', 'actions');
        res.status(500).json({ error: e.message });
    }
});

router.post('/telegram/test', async (req, res) => {
    try {
        const { botToken, chatId } = req.body;
        const ts = new Date().toLocaleString('ru-RU');
        const text = `🔔 <b>Тестовое сообщение от Home Server!</b>\n\nСвязь установлена успешно.\n🕒 ${ts}`;
        await sendTelegramMessage(text, { botToken, chatId });
        logEvent('telegram_test_sent', { chatId }, 'info', 'telegram');
        res.json({ success: true, message: 'Тестовое сообщение отправлено' });
    } catch (e) {
        logEvent('telegram_test_error', { error: e.message }, 'error', 'telegram');
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
