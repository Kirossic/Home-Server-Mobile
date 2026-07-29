let panelPassword = localStorage.getItem('panel_pw') || '';
let currentPath = '';
let deviceIP = '127.0.0.1';
let statsIntervalId = null;

async function authFetch(url, options = {}) {
    if (panelPassword) {
        options.headers = { ...options.headers, 'x-panel-pw': panelPassword };
    }
    const res = await fetch(url, options);
    if (res.status === 401) {
        document.getElementById('loginOverlay').style.display = 'flex';
        throw new Error('Unauthorized');
    }
    return res;
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
            const active = document.querySelector('.tab-content.active');
            if (active) {
                const id = active.id;
                if (id === 'dashboard') { updateStats(); loadFiles(); }
                else if (id === 'links') loadLinks();
                else if (id === 'autostart') loadBashrc();
                else if (id === 'ide') loadProjectsForIDE();
                else if (id === 'services') loadServices();
            }
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch(e) { console.error('Login error', e); }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');

    if (tabId === 'dashboard') {
        const saved = localStorage.getItem('dashboard_refresh_ms') || "3000";
        changeRefreshInterval(saved);
        updateStats();
    } else if (statsIntervalId) {
        clearInterval(statsIntervalId);
        statsIntervalId = null;
    }

    if (tabId === 'ide') loadProjectsForIDE();
    if (tabId === 'logs') loadLogs();
    if (tabId === 'autostart') loadBashrc();
    if (tabId === 'services') loadServices();
    if (tabId === 'metrics') { loadMetrics(); loadEvents(); }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateTermPrompt() {
    var prompt = document.getElementById('termPrompt');
    if (prompt) {
        var p = currentPath || '/data/data/com.termux/files/home';
        prompt.textContent = (p === '/data/data/com.termux/files/home' ? '~' : p.replace('/data/data/com.termux/files/home/', '~/')) + '$';
    }
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

window.addEventListener('DOMContentLoaded', () => {
    updateStats();
    initRefreshSettings();
    loadFiles();
    loadTunnelLinks();
    updateTunnelLinks();
    loadLinks();
    loadProcesses();
    loadServices();
    loadMetrics();
    loadEvents();
    setInterval(loadBattery, 60000);
});
