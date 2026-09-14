const { getSettings } = require('./settings.service');
const { logEvent } = require('./events.service');

let pollingActive = false;
let pollingAbortController = null;
const alertCooldowns = new Map();

function renderProgressBar(percentage, length = 10) {
    const validPct = Math.min(Math.max(percentage || 0, 0), 100);
    const filled = Math.round((validPct / 100) * length);
    const empty = length - filled;
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

function getMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📊 Статус', callback_data: 'cmd_status' },
                { text: '🌐 Туннели', callback_data: 'cmd_tunnels' }
            ],
            [
                { text: '🔋 Батарея', callback_data: 'cmd_battery' },
                { text: '🧠 RAM & CPU', callback_data: 'cmd_metrics' }
            ],
            [
                { text: '⚙️ Службы', callback_data: 'cmd_services' },
                { text: '📋 Логи ошибок', callback_data: 'cmd_logs_err' }
            ],
            [
                { text: '🧹 Сжать БД', callback_data: 'cmd_vacuum' },
                { text: '🔄 Туннели', callback_data: 'cmd_restart_tunnels' }
            ]
        ]
    };
}

async function sendTelegramMessage(text, options = {}) {
    const settings = getSettings();
    const tg = settings.telegram;
    const token = options.botToken || tg.botToken;
    const chatId = options.chatId || tg.chatId;

    if (!token || !chatId) {
        throw new Error('Telegram bot не настроен (отсутствует токен или chat_id)');
    }

    const body = {
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        disable_web_page_preview: options.disablePreview ?? false,
    };

    if (options.replyMarkup) {
        body.reply_markup = options.replyMarkup;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (!data.ok) {
        throw new Error(data.description || 'Ошибка отправки в Telegram API');
    }
    return data.result;
}

async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    const settings = getSettings();
    const token = settings.telegram.botToken;
    if (!token || !callbackQueryId) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text,
                show_alert: showAlert
            }),
            signal: AbortSignal.timeout(5000),
        });
    } catch (e) {}
}

async function registerBotCommands(token) {
    if (!token) return;
    try {
        const commands = [
            { command: 'start', description: '📱 Главное меню с кнопками' },
            { command: 'status', description: '📊 Общий статус сервера и аптайм' },
            { command: 'tunnels', description: '🌐 Ссылки на Cloudflare туннели' },
            { command: 'battery', description: '🔋 Заряд, температура и питание' },
            { command: 'metrics', description: '🧠 Нагрузка RAM и CPU' },
            { command: 'services', description: '⚙️ Статус фоновых служб' },
            { command: 'logs', description: '📋 Последние события и ошибки' },
            { command: 'vacuum', description: '🧹 Сжать базу данных SQLite' },
            { command: 'restart_tunnels', description: '🔄 Перезапустить туннели' },
            { command: 'help', description: 'ℹ️ Справка по всем функциям' }
        ];

        await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands }),
            signal: AbortSignal.timeout(8000),
        });
        console.log('[telegram] Команды бота успешно зарегистрированы в Telegram');
    } catch (e) {
        console.warn('[telegram] Не удалось зарегистрировать команды в Bot API:', e.message);
    }
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
        await sendTelegramMessage(text, { replyMarkup: getMainMenuKeyboard() });
        logEvent('telegram_alert', { reason, panelUrl, ideUrl }, 'info', 'telegram');
    } catch (e) {
        console.error('[telegram] Не удалось отправить алерт:', e.message);
        logEvent('telegram_alert_error', { error: e.message }, 'error', 'telegram');
    }
}

async function sendSecurityAlert(type, payload = {}) {
    const settings = getSettings();
    const tg = settings.telegram;
    if (!tg || !tg.enabled || !tg.botToken || !tg.chatId) return;

    if (type === 'auth_failed' && tg.notifyOnAuthFailure === false) return;
    if ((type === 'battery_temp_high' || type === 'power_disconnected') && tg.notifyOnBatteryAlert === false) return;
    if (type === 'server_error' && tg.notifyOnServerError === false) return;

    // Rate-limiting: 60 sec cooldown per alert type
    const now = Date.now();
    const lastAlert = alertCooldowns.get(type) || 0;
    if (now - lastAlert < 60000) return;
    alertCooldowns.set(type, now);

    const ts = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    let text = '';

    if (type === 'auth_failed') {
        text = [
            '🚨 <b>ВНИМАНИЕ: Неудачная попытка входа!</b>',
            '',
            `🌐 <b>IP адрес:</b> <code>${payload.ip || 'неизвестен'}</code>`,
            `🕒 <i>${ts}</i>`,
            '',
            '⚠️ <i>Кто-то пытался авторизоваться в веб-панели с неверным паролем.</i>'
        ].join('\n');
    } else if (type === 'battery_temp_high') {
        text = [
            '🔥 <b>КРИТИЧЕСКИЙ ПЕРЕГРЕВ АККУМУЛЯТОРА!</b>',
            '',
            `🌡 <b>Температура:</b> <code>${payload.temperature}°C</code>`,
            `🔋 <b>Заряд:</b> <code>${payload.percentage}%</code>`,
            `🕒 <i>${ts}</i>`,
            '',
            '⚠️ <i>Рекомендуется охладить устройство или временно отключить ресурсоёмкие задачи.</i>'
        ].join('\n');
    } else if (type === 'power_disconnected') {
        text = [
            '🔌 <b>ПИТАНИЕ ОТКЛЮЧЕНО!</b>',
            '',
            `🔋 <b>Текущий заряд:</b> <code>${payload.percentage}%</code>`,
            `⚡ <b>Статус:</b> <code>${payload.status || 'Разряжается'}</code>`,
            `🕒 <i>${ts}</i>`,
            '',
            '⚠️ <i>Сервер перешёл на работу от встроенного аккумулятора!</i>'
        ].join('\n');
    } else if (type === 'server_error') {
        text = [
            '❌ <b>Критическая ошибка сервера!</b>',
            '',
            `📍 <b>Тип:</b> <code>${payload.name || 'Ошибка'}</code>`,
            `📝 <b>Сообщение:</b> <code>${payload.message || 'Неизвестная ошибка'}</code>`,
            `🕒 <i>${ts}</i>`
        ].join('\n');
    }

    if (!text) return;

    try {
        await sendTelegramMessage(text, { replyMarkup: getMainMenuKeyboard() });
        logEvent('telegram_security_alert', { type, payload }, 'warn', 'telegram');
    } catch (e) {
        console.error('[telegram] Ошибка отправки security алерта:', e.message);
    }
}

async function getServicesStatus() {
    const { execCommand } = require('../utils/exec');
    const services = [
        { name: 'Панель (main-server)', pattern: 'node backend/src/server.js', port: 8080 },
        { name: 'Watchdog туннелей', pattern: 'tunnel-watchdog.js' },
        { name: 'VS Code (code-server)', pattern: 'code-server', port: 8085 },
        { name: 'Cloudflare Tunnels', pattern: 'cloudflared' },
        { name: 'Bukings Сервер', pattern: 'Bukings.*server.js', port: 3000 },
        { name: 'PostgreSQL', pattern: 'postgres' },
        { name: 'SSH Сервер', pattern: 'sshd', port: 8022 },
    ];

    const results = [];
    for (const s of services) {
        try {
            const { stdout } = await execCommand(`pgrep -fl "${s.pattern}"`, { timeout: 3000 });
            const lines = (stdout || '').trim().split('\n').filter(Boolean);
            if (lines.length > 0) {
                const pids = lines.map(l => l.trim().split(/\s+/)[0]).join(', ');
                results.push({ name: s.name, running: true, pids, port: s.port });
            } else {
                results.push({ name: s.name, running: false, port: s.port });
            }
        } catch (e) {
            results.push({ name: s.name, running: false, port: s.port });
        }
    }
    return results;
}

async function getBatteryStatus() {
    const { execCommand } = require('../utils/exec');
    try {
        const { stdout, exitCode } = await execCommand('termux-battery-status', { timeout: 5000 });
        if (exitCode === 0 && stdout) {
            return JSON.parse(stdout);
        }
    } catch (e) {}

    const fs = require('fs');
    try {
        const capacity = fs.readFileSync('/sys/class/power_supply/battery/capacity', 'utf-8').trim();
        const status = fs.readFileSync('/sys/class/power_supply/battery/status', 'utf-8').trim();
        let temp = null;
        if (fs.existsSync('/sys/class/power_supply/battery/temp')) {
            temp = (parseInt(fs.readFileSync('/sys/class/power_supply/battery/temp', 'utf-8').trim(), 10) / 10).toFixed(1);
        }
        return {
            percentage: parseInt(capacity, 10),
            status,
            plugged: status.toUpperCase().includes('CHARGING') ? 'PLUGGED' : 'UNPLUGGED',
            temperature: temp ? parseFloat(temp) : null,
            health: 'GOOD'
        };
    } catch (e) {}

    return null;
}

function getLatestEvents({ limit = 8, level = null } = {}) {
    const { getDb } = require('../config/database');
    try {
        const db = getDb();
        let sql = 'SELECT ts, type, detail, level, source FROM events ';
        const params = [];
        if (level) {
            sql += 'WHERE level = ? ';
            params.push(level);
        }
        sql += 'ORDER BY id DESC LIMIT ?';
        params.push(limit);
        return db.all(sql, params);
    } catch (e) {
        return [];
    }
}

// Handler for all commands (invoked by text message or callback query)
async function executeBotAction(action, { chatId, arg = '' }) {
    if (action === '/start' || action === '/help' || action === 'cmd_help') {
        const welcome = [
            '👋 <b>Home Server Bot активен!</b>',
            '',
            '<b>Доступные функции:</b>',
            '📊 /status — Общий статус сервера и аптайм',
            '🌐 /tunnels — Актуальные ссылки на Панель и IDE',
            '🔋 /battery — Заряд, питание и температура аккумулятора',
            '🧠 /metrics — Детальная нагрузка RAM и CPU',
            '⚙️ /services — Статус всех фоновых служб',
            '📋 /logs — Последние события аудита и ошибки',
            '🧹 /vacuum — Оптимизация и дефрагментация базы SQLite',
            '🔄 /restart_tunnels — Мягкий перезапуск туннелей Cloudflare',
            '',
            '<i>Используйте кнопки ниже для быстрого управления:</i>'
        ].join('\n');
        await sendTelegramMessage(welcome, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/tunnels' || action === 'cmd_tunnels') {
        const { getTunnelStatus } = require('./tunnel.service');
        const st = await getTunnelStatus();
        const msg = [
            '🌐 <b>Статус туннелей Cloudflare:</b>',
            '',
            `📊 <b>Панель:</b> ${st.panelRunning ? '🟢' : '🔴'} <code>${st.panelUrl}</code>`,
            `💻 <b>IDE:</b> ${st.ideRunning ? '🟢' : '🔴'} <code>${st.ideUrl}</code>`,
            `📡 <b>Статус соединения:</b> <b>${st.status}</b>`
        ].join('\n');
        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/status' || action === 'cmd_status') {
        const { getLocalIP, getDiskSpace } = require('../utils/system');
        const os = require('os');
        const uptime = Math.floor(os.uptime() / 60);
        const hours = Math.floor(uptime / 60);
        const mins = uptime % 60;
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const memPct = Math.round((usedMem / totalMem) * 100);
        const ip = getLocalIP();
        const disk = await getDiskSpace();

        const msg = [
            '📊 <b>Статус сервера:</b>',
            '',
            `⏱ <b>Аптайм:</b> ${hours}ч ${mins}м`,
            `🧠 <b>Память:</b> [${renderProgressBar(memPct, 8)}] ${memPct}% (${usedMem}/${totalMem} ГБ)`,
            `💾 <b>Диск:</b> ${disk.used} / ${disk.total}`,
            `🏠 <b>Локальный IP:</b> <code>${ip}</code>`,
        ].join('\n');
        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/battery' || action === 'cmd_battery') {
        const b = await getBatteryStatus();
        if (!b) {
            await sendTelegramMessage('⚠️ Данные аккумулятора временно недоступны.', { chatId, replyMarkup: getMainMenuKeyboard() });
            return;
        }

        const pct = b.percentage !== undefined ? b.percentage : b.level;
        const isCharging = b.plugged === 'PLUGGED' || (b.status && b.status.toUpperCase().includes('CHARGING'));
        const plugIcon = isCharging ? '⚡ Зарядка подключена' : '🔋 Работа от аккумулятора';

        let tempInfo = 'неизвестно';
        if (b.temperature !== undefined && b.temperature !== null) {
            const t = b.temperature;
            const badge = t < 35 ? '✅ в норме' : (t < 42 ? '⚠️ умеренный' : '🔥 ПЕРЕГРЕВ');
            tempInfo = `${t}°C (${badge})`;
        }

        const voltageInfo = b.voltage ? `${(b.voltage / 1000).toFixed(3)} В` : '—';
        const healthInfo = b.health || 'GOOD';
        const cyclesInfo = b.cycle !== undefined ? b.cycle : (b.cycles || '—');

        const msg = [
            '🔋 <b>Состояние батареи Redmi:</b>',
            '',
            `Уровень: [${renderProgressBar(pct, 10)}] <b>${pct}%</b>`,
            `Режим: <b>${plugIcon}</b>`,
            `🌡 Температура: <b>${tempInfo}</b>`,
            `⚡ Напряжение: <code>${voltageInfo}</code>`,
            `🩺 Здоровье: <b>${healthInfo}</b>`,
            `🔄 Циклов зарядки: <code>${cyclesInfo}</code>`
        ].join('\n');

        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/metrics' || action === 'cmd_metrics') {
        const os = require('os');
        const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedMem = (totalMem - freeMem).toFixed(2);
        const memPct = Math.round((usedMem / totalMem) * 100);
        const load = os.loadavg();

        const msg = [
            '🧠 <b>Метрики производительности:</b>',
            '',
            `ОЗУ: [${renderProgressBar(memPct, 10)}] <b>${memPct}%</b>`,
            `Использовано: <b>${usedMem} ГБ</b> из <b>${totalMem} ГБ</b> (свободно: ${freeMem} ГБ)`,
            '',
            '⚙️ <b>Средняя нагрузка процессора (CPU Load):</b>',
            `1 мин: <code>${load[0].toFixed(2)}</code> | 5 мин: <code>${load[1].toFixed(2)}</code> | 15 мин: <code>${load[2].toFixed(2)}</code>`
        ].join('\n');

        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/services' || action === 'cmd_services') {
        const services = await getServicesStatus();
        const lines = services.map(s => {
            const icon = s.running ? '🟢' : '🔴';
            const details = s.running ? `PID: <code>${s.pids}</code>` : '<i>остановлен</i>';
            const portInfo = s.port ? ` (порт :${s.port})` : '';
            return `${icon} <b>${s.name}</b>${portInfo}\n    └ ${details}`;
        });

        const msg = [
            '⚙️ <b>Фоновые службы сервера:</b>',
            '',
            ...lines
        ].join('\n');

        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/logs' || action === 'cmd_logs' || action === 'cmd_logs_err') {
        const onlyErrors = action === 'cmd_logs_err' || arg === 'error' || arg === 'err';
        const events = getLatestEvents({ limit: 8, level: onlyErrors ? 'warn' : null });

        if (!events || events.length === 0) {
            await sendTelegramMessage('📋 В базе событий пока нет записей.', { chatId, replyMarkup: getMainMenuKeyboard() });
            return;
        }

        const lines = events.map(e => {
            const icon = e.level === 'error' ? '🔴' : (e.level === 'warn' ? '🟡' : '🔵');
            const time = (e.ts || '').slice(11, 19);
            let detail = e.detail || '';
            try {
                const parsed = JSON.parse(detail);
                detail = Object.entries(parsed).map(([k, v]) => `${k}:${v}`).join(', ');
            } catch(err) {}
            if (detail.length > 50) detail = detail.slice(0, 50) + '...';

            return `${icon} <code>[${time}]</code> <b>${e.type}</b> (${e.source})\n    └ <i>${detail || '—'}</i>`;
        });

        const title = onlyErrors ? '📋 <b>Последние предупреждения и ошибки:</b>' : '📋 <b>Последние события аудита:</b>';
        const msg = [title, '', ...lines].join('\n');

        await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    if (action === '/vacuum' || action === 'cmd_vacuum') {
        const { vacuumDb, getDbSize } = require('../config/database');
        try {
            const before = getDbSize().sizeFormatted;
            const after = vacuumDb().sizeFormatted;
            const msg = [
                '🧹 <b>Оптимизация базы SQLite завершена!</b>',
                '',
                `Размер до: <b>${before}</b>`,
                `Размер после: <b>${after}</b>`,
                '✅ База успешно сжата, индексы перестроены.'
            ].join('\n');
            await sendTelegramMessage(msg, { chatId, replyMarkup: getMainMenuKeyboard() });
        } catch (err) {
            await sendTelegramMessage(`❌ Ошибка сжатия БД: ${err.message}`, { chatId, replyMarkup: getMainMenuKeyboard() });
        }
        return;
    }

    if (action === '/restart_tunnels' || action === 'cmd_restart_tunnels') {
        await sendTelegramMessage('⏳ <b>Перезапуск туннелей запущен...</b>\nОжидайте генерации новых ссылок (10-20 сек).', { chatId });
        const { triggerTunnelRestart, getTunnelStatus } = require('./tunnel.service');
        await triggerTunnelRestart('all');

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
                await sendTelegramMessage(doneMsg, { chatId, replyMarkup: getMainMenuKeyboard() });
                return;
            }
        }
        await sendTelegramMessage('⚠️ Туннели перезапущены, но ссылки еще инициализируются. Отправьте /tunnels через несколько секунд.', { chatId, replyMarkup: getMainMenuKeyboard() });
        return;
    }

    // Default: unknown command
    await sendTelegramMessage('❓ Неизвестная команда. Введите /help или используйте меню ниже.', { chatId, replyMarkup: getMainMenuKeyboard() });
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

    const [cmd, ...args] = text.split(/\s+/);
    logEvent('telegram_command', { cmd, chatId }, 'info', 'telegram');

    await executeBotAction(cmd, { chatId, arg: args.join(' ') });
}

async function handleCallbackQuery(cq) {
    if (!cq || !cq.message) return;
    const chatId = cq.message.chat.id;
    const data = cq.data || '';

    // Security check: only respond to the configured chatId
    const settings = getSettings();
    const configuredChatId = String(settings.telegram.chatId).trim();
    if (configuredChatId && String(chatId) !== configuredChatId) {
        await answerCallbackQuery(cq.id, 'Доступ запрещён', true);
        return;
    }

    await answerCallbackQuery(cq.id);
    logEvent('telegram_callback', { data, chatId }, 'info', 'telegram');

    await executeBotAction(data, { chatId });
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
    await registerBotCommands(tg.botToken);

    let offset = 0;

    while (pollingActive) {
        try {
            const url = `https://api.telegram.org/bot${tg.botToken}/getUpdates?offset=${offset}&timeout=20`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
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
                    } else if (update.callback_query) {
                        try {
                            await handleCallbackQuery(update.callback_query);
                        } catch (cqErr) {
                            console.error('[telegram] Ошибка обработки callback_query:', cqErr.message);
                        }
                    }
                }
            }
        } catch (e) {
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
    sendSecurityAlert,
    startPolling,
    stopPolling,
    restartPolling,
};
