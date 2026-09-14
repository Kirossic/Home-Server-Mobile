const { execCommand } = require('../utils/exec');

let cachedBatteryStatus = null;
let lastBatteryFetch = 0;
let inFlightFetchPromise = null;

function formatBatteryMode(b) {
    if (!b) return '—';
    const rawPlugged = (b.plugged || '').toUpperCase();
    const rawStatus = (b.status || '').toUpperCase();

    const isPlugged = rawPlugged.startsWith('PLUGGED') && rawPlugged !== 'UNPLUGGED';
    const isCharging = rawStatus === 'CHARGING';
    const isFull = rawStatus === 'FULL';

    if (isFull && isPlugged) {
        return '🟢 Батарея заряжена (100%, от сети)';
    }

    if (isCharging || isPlugged) {
        if (rawPlugged.includes('AC')) return '⚡ Зарядка от сети (AC)';
        if (rawPlugged.includes('USB')) return '🔌 Зарядка по USB';
        if (rawPlugged.includes('WIRELESS')) return '📶 Беспроводная зарядка';
        return '⚡ Зарядка подключена';
    }

    if (rawStatus === 'DISCHARGING' || rawPlugged === 'UNPLUGGED') {
        return '🔋 Работа от аккумулятора (разряжается)';
    }

    return '🔋 ' + (b.status || 'От аккумулятора');
}

async function fetchFromTermux() {
    try {
        const { stdout, exitCode } = await execCommand('termux-battery-status', { 
            timeout: 10000, 
            silent: true 
        });
        if (exitCode === 0 && stdout) {
            const b = JSON.parse(stdout);
            if (b && (b.percentage !== undefined || b.level !== undefined)) {
                cachedBatteryStatus = b;
                lastBatteryFetch = Date.now();
                return b;
            }
        }
    } catch (e) {}
    return null;
}

function getFromDb() {
    try {
        const { getDb } = require('../config/database');
        const row = getDb().get(`
            SELECT percentage, status, temperature, voltage, health, cycles, ts
            FROM metrics_battery
            ORDER BY id DESC
            LIMIT 1
        `);
        if (row && row.percentage !== undefined) {
            const isChg = (row.status && row.status.toUpperCase() === 'CHARGING');
            return {
                percentage: row.percentage,
                level: row.percentage,
                status: row.status,
                plugged: isChg ? 'PLUGGED_AC' : 'UNPLUGGED',
                temperature: row.temperature,
                voltage: row.voltage,
                health: row.health || 'GOOD',
                cycle: row.cycles || '—',
                isHistoricalFallback: true,
                recordedAt: row.ts
            };
        }
    } catch (e) {}
    return null;
}

async function getBatteryStatus({ forceFresh = false, maxAgeMs = 7000 } = {}) {
    const now = Date.now();
    if (!forceFresh && cachedBatteryStatus && (now - lastBatteryFetch < maxAgeMs)) {
        return cachedBatteryStatus;
    }

    if (inFlightFetchPromise) {
        return inFlightFetchPromise;
    }

    inFlightFetchPromise = (async () => {
        try {
            const result = await fetchFromTermux();
            if (result) return result;
        } finally {
            inFlightFetchPromise = null;
        }

        if (cachedBatteryStatus) {
            return cachedBatteryStatus;
        }

        return getFromDb();
    })();

    return inFlightFetchPromise;
}

module.exports = {
    getBatteryStatus,
    formatBatteryMode
};
