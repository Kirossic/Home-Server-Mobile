let panelPassword = localStorage.getItem('panel_pw') || '';
let currentPath = '';
let deviceIP = '127.0.0.1';
let statsIntervalId = null;

// Modal Promise resolvers
let confirmResolve = null;
let promptResolve = null;

// ═══════════════════ TOAST NOTIFICATIONS ═══════════════════
function showToast(msg, type = 'success', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '✅';
    if (type === 'error') icon = '❌';
    else if (type === 'warn') icon = '⚠️';
    else if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icon}</span>
            <span class="toast-msg">${escapeHtml(msg)}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    const timer = setTimeout(() => {
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 250);
    }, duration);

    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timer);
        toast.remove();
    });
}

// ═══════════════════ CONFIRM & PROMPT MODALS ═══════════════════
function confirmModal(options = {}) {
    const title = options.title || 'Подтверждение действия';
    const message = typeof options === 'string' ? options : (options.message || '');
    const confirmText = options.confirmText || 'Подтвердить';
    const cancelText = options.cancelText || 'Отмена';
    const isDanger = options.danger !== false;

    return new Promise((resolve) => {
        confirmResolve = resolve;
        const overlay = document.getElementById('confirmOverlay');
        const titleEl = document.getElementById('confirmModalTitle');
        const msgEl = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmModalBtnConfirm');
        const cancelBtn = document.getElementById('confirmModalBtnCancel');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (confirmBtn) {
            confirmBtn.textContent = confirmText;
            confirmBtn.className = isDanger ? 'btn-danger' : '';
            confirmBtn.style.marginTop = '0';
            confirmBtn.focus();
        }
        if (cancelBtn) cancelBtn.textContent = cancelText;

        if (overlay) overlay.style.display = 'flex';
    });
}

function closeConfirmModal(result) {
    const overlay = document.getElementById('confirmOverlay');
    if (overlay) overlay.style.display = 'none';
    if (confirmResolve) {
        confirmResolve(!!result);
        confirmResolve = null;
    }
}

function promptModal(options = {}) {
    const title = options.title || 'Ввод данных';
    const message = options.message || '';
    const defaultValue = options.defaultValue || '';
    const placeholder = options.placeholder || '';

    return new Promise((resolve) => {
        promptResolve = resolve;
        const overlay = document.getElementById('promptOverlay');
        const titleEl = document.getElementById('promptModalTitle');
        const msgEl = document.getElementById('promptModalMessage');
        const inputEl = document.getElementById('promptModalInput');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (inputEl) {
            inputEl.value = defaultValue;
            inputEl.placeholder = placeholder;
        }

        if (overlay) {
            overlay.style.display = 'flex';
            setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
        }
    });
}

function closePromptModal(result) {
    const overlay = document.getElementById('promptOverlay');
    if (overlay) overlay.style.display = 'none';
    if (promptResolve) {
        promptResolve(result !== null && result !== undefined ? String(result).trim() : null);
        promptResolve = null;
    }
}

// ═══════════════════ CLIPBOARD UTILITY ═══════════════════
async function copyToClipboard(text, successMsg = 'Скопировано в буфер!') {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        showToast(successMsg, 'success', 2500);
    } catch(e) {
        showToast('Не удалось скопировать', 'error');
    }
}

// ═══════════════════ AUTH & LOGOUT ═══════════════════
async function authFetch(url, options = {}) {
    if (panelPassword) {
        options.headers = { ...options.headers, 'x-panel-pw': panelPassword };
    }
    try {
        const res = await fetch(url, options);
        if (res.status === 401) {
            document.getElementById('loginOverlay').style.display = 'flex';
            throw new Error('Unauthorized');
        }
        updateHeaderOnlineStatus(true);
        return res;
    } catch (err) {
        if (err.message !== 'Unauthorized') {
            updateHeaderOnlineStatus(false);
        }
        throw err;
    }
}

async function submitLogin() {
    const pw = document.getElementById('loginPassword').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        });
        if (res.ok) {
            panelPassword = pw;
            localStorage.setItem('panel_pw', pw);
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginError').style.display = 'none';
            showToast('Успешная авторизация', 'success');
            const active = document.querySelector('.tab-content.active');
            if (active) {
                const id = active.id;
                if (id === 'dashboard') { updateStats(); loadFiles(); }
                else if (id === 'links') loadLinks();
                else if (id === 'autostart') loadBashrc();
                else if (id === 'ide') loadProjectsForIDE();
                else if (id === 'services') loadServices();
                else if (id === 'processes') loadProcesses();
                else if (id === 'logs') loadLogs();
                else if (id === 'metrics') { loadMetrics(); loadEvents(); }
            }
        } else {
            document.getElementById('loginError').style.display = 'block';
            showToast('Неверный пароль', 'error');
        }
    } catch(e) {
        console.error('Login error', e);
        showToast('Ошибка сети при входе', 'error');
    }
}

async function logout() {
    const confirmed = await confirmModal({
        title: 'Выход из сессии',
        message: 'Вы уверены, что хотите выйти из панели управления?',
        confirmText: 'Выйти',
        danger: false
    });
    if (!confirmed) return;

    panelPassword = '';
    localStorage.removeItem('panel_pw');
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('loginPassword').value = '';
    showToast('Вы вышли из системы', 'info');
}

// ═══════════════════ HEADER STATUS BADGES ═══════════════════
function updateHeaderOnlineStatus(isOnline) {
    const badge = document.getElementById('headerStatusBadge');
    const text = document.getElementById('headerStatusText');
    if (!badge || !text) return;

    if (isOnline) {
        badge.className = 'status-badge';
        text.textContent = 'Онлайн';
    } else {
        badge.className = 'status-badge offline';
        text.textContent = 'Офлайн';
    }
}

function updateHeaderPills(ip, uptimeMin, batteryText, batteryIcon) {
    if (ip) {
        const ipEl = document.getElementById('headerIp');
        if (ipEl) ipEl.textContent = ip;
    }
    if (uptimeMin !== undefined) {
        const upEl = document.getElementById('headerUptime');
        if (upEl) {
            const h = Math.floor(uptimeMin / 60);
            const m = uptimeMin % 60;
            upEl.textContent = h > 0 ? `${h}ч ${m}м` : `${m}м`;
        }
    }
    if (batteryText) {
        const batEl = document.getElementById('headerBat');
        if (batEl) batEl.textContent = batteryText;
    }
    if (batteryIcon) {
        const batIconEl = document.getElementById('headerBatIcon');
        if (batIconEl) batIconEl.textContent = batteryIcon;
    }
}

// ═══════════════════ TAB SWITCHING ═══════════════════
const TAB_IDS = ['dashboard', 'links', 'ide', 'services', 'terminal', 'logs', 'processes', 'metrics', 'autostart'];

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');

    if (btn) {
        btn.classList.add('active');
    } else {
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }

    // Scroll active tab button into view horizontally smoothly
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`) || btn;
    if (activeBtn && activeBtn.scrollIntoView) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    if (tabId === 'dashboard') {
        const saved = localStorage.getItem('dashboard_refresh_ms') || "3000";
        changeRefreshInterval(saved);
        updateStats();
    } else if (statsIntervalId) {
        clearInterval(statsIntervalId);
        statsIntervalId = null;
    }

    if (tabId === 'links') {
        if (typeof loadLinks === 'function') loadLinks();
        if (typeof startLinkStatusRefresh === 'function') startLinkStatusRefresh();
    }
    if (tabId === 'ide' && typeof loadProjectsForIDE === 'function') loadProjectsForIDE();
    if (tabId === 'logs' && typeof loadLogs === 'function') loadLogs();
    if (tabId === 'processes' && typeof loadProcesses === 'function') loadProcesses();
    if (tabId === 'terminal') {
        if (typeof updateTermPrompt === 'function') updateTermPrompt();
        if (typeof initTerminalKeybindings === 'function') initTerminalKeybindings();
    }
    if (tabId === 'autostart' && typeof loadBashrc === 'function') loadBashrc();
    if (tabId === 'services' && typeof loadServices === 'function') loadServices();
    if (tabId === 'metrics') {
        if (typeof loadMetrics === 'function') loadMetrics();
        if (typeof loadEvents === 'function') loadEvents();
        if (typeof loadArchiveList === 'function') loadArchiveList();
        if (typeof loadDbStats === 'function') loadDbStats();
    }
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateTermPrompt() {
    const prompt = document.getElementById('termPrompt');
    const badge = document.getElementById('terminalCwdBadge');
    const p = currentPath || '/data/data/com.termux/files/home';
    const displayP = (p === '/data/data/com.termux/files/home' ? '~' : p.replace('/data/data/com.termux/files/home/', '~/'));

    if (prompt) prompt.textContent = displayP + '$';
    if (badge) badge.textContent = displayP;
}

function changeRefreshInterval(value) {
    const ms = parseInt(value, 10);
    localStorage.setItem('dashboard_refresh_ms', value);

    if (statsIntervalId) {
        clearInterval(statsIntervalId);
        statsIntervalId = null;
    }

    if (ms > 0) {
        statsIntervalId = setInterval(updateStats, ms);
    }
}

function initRefreshSettings() {
    const savedValue = localStorage.getItem('dashboard_refresh_ms') || "3000";
    const selectEl = document.getElementById('refreshInterval');
    if (selectEl) {
        selectEl.value = savedValue;
    }
    changeRefreshInterval(savedValue);
}

// ═══════════════════ KEYBOARD SHORTCUTS ═══════════════════
window.addEventListener('keydown', (e) => {
    // Escape closes open overlays
    if (e.key === 'Escape') {
        closeConfirmModal(false);
        closePromptModal(null);
        if (typeof closeTelegramModal === 'function') closeTelegramModal();
        if (typeof closeImagePreview === 'function') closeImagePreview();
        if (typeof hideLinkForm === 'function') hideLinkForm();
    }

    // Ctrl + 1..9 switches tabs
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < TAB_IDS.length) {
            e.preventDefault();
            switchTab(TAB_IDS[idx]);
        }
    }
});

// ═══════════════════ INITIALIZATION ═══════════════════
window.addEventListener('DOMContentLoaded', () => {
    updateStats();
    initRefreshSettings();
    if (typeof loadFiles === 'function') loadFiles();
    if (typeof loadTunnelLinks === 'function') loadTunnelLinks();
    if (typeof updateTunnelLinks === 'function') updateTunnelLinks();
});
