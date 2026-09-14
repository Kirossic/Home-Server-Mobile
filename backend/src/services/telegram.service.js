const { getSettings } = require('./settings.service');
const { logEvent } = require('./events.service');

let pollingActive = false;
let pollingAbortController = null;

async function sendTelegramMessage(text, options = {}) {
    const settings = getSettings();
    const tg = settings.telegram;
    const token = options.botToken || tg.botToken;
    const chatId = options.chatId || tg.chatId;

    if (!token || !chatId) {
        throw new Error('Telegram bot не настроен (отсутствует токен или chat_id)');
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: options.parseMode || 'HTML',
            disable_web_page_preview: options.disablePreview ?? false,
        }),
        signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!data.ok) {
        throw new Error(data.description || 'Ошибка отправки в Telegram API');
    }
    return data.result;
}

async function sendTunnelAlert({ panelUrl, ideUrl, reason = 'Обновление туннелей' }) {
    const settings = getSettings();
    const tg = settings.telegram;
    if (!tg || !tg.enabled || !tg.botToken || !tg.chatId || !tg.notifyOnTunnelRestart) {
        return;
    }

    const ts = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const text = [
        '🌐 <b>Cloudflare Tunnels обновлены!</b>',
        '',
        `📍 <b>Причина:</b> ${reason}`,
        '',
        '📊 <b>Панель управления:</b>',
        panelUrl && panelUrl.startsWith('http') ? `<code>${panelUrl}</code>` : '<i>(недоступна)</i>',
        '',
        '💻 <b>VS Code IDE:</b>',
        ideUrl && ideUrl.startsWith('http') ? `<code>${ideUrl}</code>` : '<i>(недоступна)</i>',
        '',
        `🕒 <i>${ts}</i>`
    ].join('\n');

    try {
        await sendTelegramMessage(text);
        console.log('[telegram] Уведомление о туннелях успешно отправлено.');
        logEvent('telegram_alert', { reason, panelUrl, ideUrl }, 'info', 'telegram');
    } catch (e) {
        console.error('[telegram] Не удалось отправить алерт:', e.message);
        logEvent('telegram_alert_error', { error: e.message }, 'error', 'telegram');
    }
}

async function handleBotCommand(message) {
    const text = (message.text || '').trim();
    const chatId = message.chat.id;

    // Security check: only respond to the configured chatId
    const settings = getSettings();
    const configuredChatId = String(settings.telegram.chatId).trim();
    if (configuredChatId && String(chatId) !== configuredChatId) {
        console.warn(`[telegram] Игнорирование команды от неавторизованного chatId: ${chatId}`);
        logEvent('telegram_unauthorized', { text, chatId }, 'warn', 'telegram');
        return;
    }

    const [cmd] = text.split(' ');
    logEvent('telegram_command', { cmd, chatId }, 'info', 'telegram');

    if (cmd === '/start' || cmd === '/help') {
        const welcome = [
            '👋 <b>Home Server Bot активен!</b>',
            '',
            'Доступные команды:',
            '🌐 /tunnels — актуальные ссылки на Панель и IDE',
            '📊 /status — краткий статус сервера и аптайм',
            '🔄 /restart_tunnels — мягкий перезапуск туннелей Cloudflare'
        ].join('\n');
        await sendTelegramMessage(welcome, { chatId });
        return;
    }

    if (cmd === '/tunnels') {
        const { getTunnelStatus } = require('./tunnel.service');
        const st = await getTunnelStatus();
        const msg = [
            '🌐 <b>Статус туннелей Cloudflare:</b>',
            '',
            `📊 Панель: ${st.panelRunning ? '🟢' : '🔴'} <code>${st.panelUrl}</code>`,
            `💻 IDE: ${st.ideRunning ? '🟢' : '🔴'} <code>${st.ideUrl}</code>`,
            `Статус: <b>${st.status}</b>`
        ].join('\n');
        await sendTelegramMessage(msg, { chatId });
        return;
    }

    if (cmd === '/status') {
        const { getLocalIP, getDiskSpace } = require('../utils/system');
        const os = require('os');
        const uptime = Math.floor(os.uptime() / 60);
        const hours = Math.floor(uptime / 60);
        const mins = uptime % 60;
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const ip = getLocalIP();
        const disk = await getDiskSpace();

        const msg = [
            '📊 <b>Статус сервера:</b>',
            `⏱ Аптайм: ${hours}ч ${mins}м`,
            `🧠 Память: свободно ${freeMem} ГБ из ${totalMem} ГБ`,
            `💾 Диск: ${disk.used} / ${disk.total}`,
            `🏠 Локальный IP: <code>${ip}</code>`,
        ].join('\n');
        await sendTelegramMessage(msg, { chatId });
        return;
    }

    if (cmd === '/restart_tunnels') {
        await sendTelegramMessage('⏳ <b>Перезапуск туннелей запущен...</b>\nОжидайте генерации новых ссылок (10-20 сек).', { chatId });
        const { triggerTunnelRestart, getTunnelStatus } = require('./tunnel.service');
        await triggerTunnelRestart('all');

        // Wait for ready
        let attempts = 0;
        while (attempts < 15) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
            const st = await getTunnelStatus();
            if (st.status === 'ready' && st.panelUrl && st.panelUrl.startsWith('http') && st.ideUrl && st.ideUrl.startsWith('http')) {
                const doneMsg = [
                    '✅ <b>Туннели успешно перезапущены!</b>',
                    '',
                    `📊 Панель: <code>${st.panelUrl}</code>`,
                    `💻 IDE: <code>${st.ideUrl}</code>`,
                ].join('\n');
                await sendTelegramMessage(doneMsg, { chatId });
                return;
            }
        }
        await sendTelegramMessage('⚠️ Туннели перезапущены, но ссылки еще инициализируются. Отправьте /tunnels через несколько секунд.', { chatId });
        return;
    }
}

async function startPolling() {
    const settings = getSettings();
    const tg = settings.telegram;
    if (!tg.enabled || !tg.botToken) {
        return;
    }

    if (pollingActive) return;
    pollingActive = true;
    pollingAbortController = new AbortController();

    console.log('[telegram] Запуск polling Telegram бота на сервере...');
    let offset = 0;

    while (pollingActive) {
        try {
            const url = `https://api.telegram.org/bot${tg.botToken}/getUpdates?offset=${offset}&timeout=20`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
                // E.g. token invalid or rate limit
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            const data = await res.json();
            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    if (update.message && update.message.text) {
                        try {
                            await handleBotCommand(update.message);
                        } catch (cmdErr) {
                            console.error('[telegram] Ошибка обработки команды:', cmdErr.message);
                        }
                    }
                }
            }
        } catch (e) {
            // Network timeout / DNS drop / abort
            if (!pollingActive) break;
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

function stopPolling() {
    pollingActive = false;
    if (pollingAbortController) {
        try { pollingAbortController.abort(); } catch(e) {}
        pollingAbortController = null;
    }
}

function restartPolling() {
    stopPolling();
    setTimeout(() => {
        startPolling();
    }, 1000);
}

module.exports = {
    sendTelegramMessage,
    sendTunnelAlert,
    startPolling,
    stopPolling,
    restartPolling,
};
