const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.resolve(__dirname, '../../../data/settings.json');

const DEFAULT_SETTINGS = {
    telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
        notifyOnTunnelRestart: true,
        notifyOnAuthFailure: true,
        notifyOnBatteryAlert: true,
        notifyOnServerError: true,
    }
};

function getSettings() {
    let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                settings = {
                    ...settings,
                    ...parsed,
                    telegram: { ...settings.telegram, ...(parsed.telegram || {}) }
                };
            }
        } catch (e) {}
    }

    // Fallback to environment variables if settings are empty
    if (!settings.telegram.botToken && process.env.TELEGRAM_BOT_TOKEN) {
        settings.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    }
    if (!settings.telegram.chatId && process.env.TELEGRAM_CHAT_ID) {
        settings.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
    }
    if (!settings.telegram.enabled && settings.telegram.botToken && settings.telegram.chatId) {
        settings.telegram.enabled = true;
    }

    return settings;
}

function maskToken(token) {
    if (!token || typeof token !== 'string') return '';
    const trimmed = token.trim();
    if (trimmed.length < 10) return '***';
    return trimmed.slice(0, 6) + '...' + trimmed.slice(-4);
}

function getPublicTelegramSettings() {
    const settings = getSettings();
    const tg = settings.telegram;
    return {
        enabled: !!tg.enabled,
        configured: !!tg.botToken,
        botTokenMasked: maskToken(tg.botToken),
        chatId: tg.chatId || '',
        notifyOnTunnelRestart: tg.notifyOnTunnelRestart !== false,
        notifyOnAuthFailure: tg.notifyOnAuthFailure !== false,
        notifyOnBatteryAlert: tg.notifyOnBatteryAlert !== false,
        notifyOnServerError: tg.notifyOnServerError !== false,
    };
}

function saveTelegramSettings({ enabled, botToken, chatId, notifyOnTunnelRestart, notifyOnAuthFailure, notifyOnBatteryAlert, notifyOnServerError }) {
    const dataDir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const settings = getSettings();

    // Protect token from being overwritten by a mask
    if (botToken !== undefined && typeof botToken === 'string') {
        const trimmed = botToken.trim();
        if (trimmed && !trimmed.includes('...')) {
            settings.telegram.botToken = trimmed;
        }
    }

    if (chatId !== undefined) {
        settings.telegram.chatId = String(chatId).trim();
    }

    if (notifyOnTunnelRestart !== undefined) {
        settings.telegram.notifyOnTunnelRestart = !!notifyOnTunnelRestart;
    }
    if (notifyOnAuthFailure !== undefined) {
        settings.telegram.notifyOnAuthFailure = !!notifyOnAuthFailure;
    }
    if (notifyOnBatteryAlert !== undefined) {
        settings.telegram.notifyOnBatteryAlert = !!notifyOnBatteryAlert;
    }
    if (notifyOnServerError !== undefined) {
        settings.telegram.notifyOnServerError = !!notifyOnServerError;
    }

    if (enabled !== undefined) {
        settings.telegram.enabled = !!enabled;
    } else if (settings.telegram.botToken && settings.telegram.chatId) {
        settings.telegram.enabled = true;
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return getPublicTelegramSettings();
}

module.exports = {
    getSettings,
    getPublicTelegramSettings,
    saveTelegramSettings,
    maskToken,
    SETTINGS_FILE,
};
