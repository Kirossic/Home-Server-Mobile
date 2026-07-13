let currentPath = '';
let lastMetric = null;

function toggleMetric(el) {
    const detail = el.querySelector('.metric-detail');
    const arrow = el.querySelector('.metric-arrow');
    if (!detail) return;
    if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
        arrow.textContent = '▸';
        return;
    }
    // Close previous
    if (lastMetric && lastMetric !== el) {
        lastMetric.classList.remove('expanded');
        const prevArrow = lastMetric.querySelector('.metric-arrow');
        if (prevArrow) prevArrow.textContent = '▸';
    }
    el.classList.add('expanded');
    arrow.textContent = '▾';
    lastMetric = el;
}

// Override updateStats to include all detail fields
updateStats = async function() {
    try {
        const res = await authFetch('/api/stats');
        const d = await res.json();
        deviceIP = d.ip;
        document.getElementById('os').innerText = d.os;
        document.getElementById('ramUsed').innerText = d.ramUsed;
        document.getElementById('ramTotal').innerText = d.ramTotal;
        document.getElementById('ramFree').innerText = d.ramFree;
        document.getElementById('diskUsed').innerText = d.diskUsed;
        document.getElementById('diskTotal').innerText = d.diskTotal;
        document.getElementById('ip').innerText = d.ip;
        document.getElementById('uptime').innerText = d.uptime;

        // RAM chart
        ramHistory.push({ used: parseFloat(d.ramUsed), total: parseFloat(d.ramTotal) });
        if (ramHistory.length > 60) ramHistory.shift();
        drawRamChart();
    } catch(e) {}
};
let panelPassword = localStorage.getItem('panel_pw') || '';

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
            // Reload current tab
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

let openFilePath = '';
let deviceIP = '127.0.0.1';
let statsIntervalId = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
    
    if (tabId === 'ide') loadProjectsForIDE();
    if (tabId === 'logs') loadLogs();
    if (tabId === 'autostart') loadBashrc();
    if (tabId === 'services') loadServices();
}

async function updateStats() {
    try {
        const res = await authFetch('/api/stats');
        const d = await res.json();
        deviceIP = d.ip;
        document.getElementById('os').innerText = d.os;
        document.getElementById('ramUsed').innerText = d.ramUsed;
        document.getElementById('ramTotal').innerText = d.ramTotal;
        document.getElementById('ramFree').innerText = d.ramFree;
        document.getElementById('diskUsed').innerText = d.diskUsed;
        document.getElementById('diskTotal').innerText = d.diskTotal;
        document.getElementById('ip').innerText = d.ip;
        document.getElementById('uptime').innerText = d.uptime;
        loadBattery();


    } catch(e) {}
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

async function loadFiles(dirPath = '') {
    try {
        const res = await authFetch(`/api/files/list?path=${encodeURIComponent(dirPath)}`);
        const data = await res.json();
        if (data.error) return alert(data.error);

        currentPath = data.currentPath;
        document.getElementById('pathBar').innerText = currentPath;
        updateTermPrompt();
        const container = document.getElementById('filesContainer');
        container.innerHTML = '';

        data.files.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
        data.files.forEach(f => {
            const div = document.createElement('div');
            div.className = `file-item ${f.isDir ? 'dir' : ''}`;
            div.innerHTML = `<span>${f.isDir ? '📁' : '📄'} ${f.name}</span>`;
            div.onclick = () => f.isDir ? loadFiles(f.fullPath) : openFile(f.fullPath);

            const actions = document.createElement('span');
            actions.className = 'file-actions';
            if (f.isDir) {
                const zipBtn = document.createElement('span');
                zipBtn.className = 'action-btn zip-btn';
                zipBtn.title = 'Скачать как ZIP';
                zipBtn.innerHTML = '📦';
                zipBtn.onclick = (e) => { e.stopPropagation(); downloadDir(f.fullPath); };
                actions.appendChild(zipBtn);
            } else {
                const dlBtn = document.createElement('span');
                dlBtn.className = 'action-btn dl-btn';
                dlBtn.title = 'Скачать';
                dlBtn.innerHTML = '⬇';
                dlBtn.onclick = (e) => { e.stopPropagation(); downloadFile(f.fullPath); };
                actions.appendChild(dlBtn);
            }
            const delBtn = document.createElement('span');
            delBtn.className = 'action-btn del-btn';
            delBtn.title = 'Удалить';
            delBtn.innerHTML = '🗑';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteFileOrDir(f.fullPath); };
            actions.appendChild(delBtn);
            div.appendChild(actions);
            container.appendChild(div);
        });
    } catch(e) {}
}

function goBack() {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadFiles('/' + parts.join('/'));
}

async function openFile(filePath) {
    openFilePath = filePath;
    try {
        const res = await authFetch(`/api/files/view?path=${encodeURIComponent(filePath)}`);
        const text = await res.text();
        document.getElementById('editorTitle').innerText = `Редактирование: ${filePath.split('/').pop()}`;
        const ed = document.getElementById('editor');
        ed.value = text; ed.disabled = false;
        document.getElementById('saveBtn').style.display = 'block';
    } catch(e) { alert('Не удалось открыть файл'); }
}

async function saveCurrentFile() {
    const content = document.getElementById('editor').value;
    try {
        const res = await authFetch(`/api/files/save?path=${encodeURIComponent(openFilePath)}`, { method: 'POST', body: content });
        if (res.ok) alert('Сохранено успешно!');
    } catch(e) { alert('Ошибка сети'); }
}

async function loadProjectsForIDE() {
    try {
        const res = await authFetch('/api/files/list?path=' + encodeURIComponent('/data/data/com.termux/files/home/projects'));
        const data = await res.json();
        const container = document.getElementById('projectsIdeContainer');
        container.innerHTML = '';
        
        data.files.filter(f => f.isDir).forEach(p => {
            const a = document.createElement('a');
            a.className = 'link-card';
            a.href = `http://${deviceIP}:8085/?folder=${encodeURIComponent(p.fullPath)}`;
            a.target = '_blank';
            a.innerHTML = `<h3>📁 ${p.name}</h3><p>Открыть папку напрямую в IDE</p>`;
            container.appendChild(a);
        });
    } catch(e) {}
}

async function loadBashrc() {
    try {
        const res = await authFetch('/api/autostart/get');
        const text = await res.text();
        document.getElementById('bashrcEditor').value = text;
    } catch(e) { alert('Ошибка при загрузке .bashrc'); }
}

async function saveBashrc() {
    const content = document.getElementById('bashrcEditor').value;
    try {
        const res = await authFetch('/api/autostart/save', { method: 'POST', body: content });
        if (res.ok) alert('Конфигурация автозапуска обновлена!');
    } catch(e) { alert('Ошибка сохранения .bashrc'); }
}

async function triggerSystemRestart() {
    if (!confirm('Вы уверены, что хотите принудительно завершить все фоновые службы и перезапустить систему с чистого листа? Панель будет недоступна около 3-5 секунд.')) return;
    try {
        await authFetch('/api/system/restart', { method: 'POST' });
    } catch(e) {}
    
    setTimeout(() => {
        window.location.reload();
    }, 3000);
}

async function loadTunnelLinks() {
    try {
        const response = await authFetch('/api/tunnel/links');
        const links = await response.json();
        console.log("Tunnel links loaded");
    } catch (e) {
        console.error("Не удалось загрузить ссылки туннеля", e);
    }
}

async function updateTunnelLinks() {
    try {
        const response = await authFetch('/api/tunnel/links');
        const data = await response.json();
        
        const panelLink = document.getElementById('tunnel-panel-link');
        const ideLink = document.getElementById('tunnel-ide-link');
        
        if (panelLink && data.panelUrl) {
            panelLink.href = data.panelUrl;
            panelLink.innerText = data.panelUrl.includes('trycloudflare') ? "Открыть Панель Управления" : data.panelUrl;
        }
        
        if (ideLink && data.ideUrl) {
            // Добавляем к ссылке туннеля IDE параметр автоматического открытия папки проекта
            ideLink.href = data.ideUrl + "/?folder=/data/data/com.termux/files/home/projects/main-server";
            ideLink.innerText = data.ideUrl.includes('trycloudflare') ? "🚀 Открыть IDE с кодом" : data.ideUrl;
        }
    } catch (error) {
        console.error("Ошибка обновления ссылок:", error);
    }
}

function downloadFile(filePath) {
    window.open(`/api/files/download?path=${encodeURIComponent(filePath)}`, '_blank');
}

function downloadDir(dirPath) {
    window.open(`/api/files/download-dir?path=${encodeURIComponent(dirPath)}`, '_blank');
}

async function deleteFileOrDir(targetPath) {
    const name = targetPath.split('/').pop();
    if (!confirm(`Удалить "${name}"? Это действие необратимо.`)) return;
    try {
        const res = await authFetch(`/api/files/delete?path=${encodeURIComponent(targetPath)}`, { method: 'DELETE' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка при удалении'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function uploadFile() {
    const input = document.getElementById('fileInput');
    const file = input.files[0];
    if (!file) return;
    try {
        const res = await authFetch(`/api/files/upload?dir=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка загрузки'); }
    } catch(e) { alert('Ошибка сети'); }
    input.value = '';
}

async function createFolder() {
    const name = prompt('Введите имя новой папки:');
    if (!name || !name.trim()) return;
    let folderPath = currentPath === '/' ? '/' + name.trim() : currentPath + '/' + name.trim();
    if (currentPath.endsWith('/')) folderPath = currentPath + name.trim();
    try {
        const res = await authFetch(`/api/files/mkdir?path=${encodeURIComponent(folderPath)}`, { method: 'POST' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка создания папки'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function createFile() {
    const name = prompt('Введите имя файла (с расширением):');
    if (!name || !name.trim()) return;
    let filePath = currentPath === '/' ? '/' + name.trim() : currentPath + '/' + name.trim();
    if (currentPath.endsWith('/')) filePath = currentPath + name.trim();
    try {
        const res = await authFetch('/api/files/create?path=' + encodeURIComponent(filePath), { method: 'POST' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка создания файла'); }
    } catch(e) { alert('Ошибка сети'); }
}

let linksData = [];

async function loadLinksStatus() {
    try {
        const res = await authFetch('/api/links/status');
        return await res.json();
    } catch(e) { return []; }
}

async function loadLinks() {
    try {
        const res = await authFetch('/api/links');
        linksData = await res.json();
        const container = document.getElementById('linksContainer');
        container.innerHTML = '';
        linksData.forEach(link => {
            const card = document.createElement('div');
            card.className = 'link-card';
            const statuses = window._linkStatuses || [];
            const st = statuses.find(s => s.id === link.id);
            const dot = st ? (st.online ? '<span style="color:#04d361">●</span>' : '<span style="color:#e53e3e">●</span>') : '';
            card.innerHTML = `
                <div class="link-card-header">
                    <span class="link-icon">${link.icon || '🔗'}</span>
                    <h3>${link.name} ${dot}</h3>
                </div>
                <p>${link.desc || ''}</p>
                <div class="link-card-actions">
                    <a href="${link.url}" target="_blank" class="btn-link-open">Открыть</a>
                    <button class="btn-link-edit" onclick="editLink(${link.id})">✏</button>
                    <button class="btn-link-del" onclick="deleteLink(${link.id})">🗑</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch(e) { console.error('loadLinks error', e); }
}

function showAddLinkForm() {
    document.getElementById('linkFormTitle').innerText = 'Добавить ссылку';
    document.getElementById('linkEditId').value = '';
    document.getElementById('linkName').value = '';
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkIcon').value = '';
    document.getElementById('linkDesc').value = '';
    document.getElementById('linkFormOverlay').style.display = 'flex';
}

function hideLinkForm() {
    document.getElementById('linkFormOverlay').style.display = 'none';
}

function editLink(id) {
    const link = linksData.find(l => l.id === id);
    if (!link) return;
    document.getElementById('linkFormTitle').innerText = 'Редактировать ссылку';
    document.getElementById('linkEditId').value = id;
    document.getElementById('linkName').value = link.name;
    document.getElementById('linkUrl').value = link.url;
    document.getElementById('linkIcon').value = link.icon || '';
    document.getElementById('linkDesc').value = link.desc || '';
    document.getElementById('linkFormOverlay').style.display = 'flex';
}

async function saveLink() {
    const id = document.getElementById('linkEditId').value;
    const name = document.getElementById('linkName').value.trim();
    const url = document.getElementById('linkUrl').value.trim();
    const icon = document.getElementById('linkIcon').value.trim();
    const desc = document.getElementById('linkDesc').value.trim();
    if (!name || !url) { alert('Название и URL обязательны'); return; }

    if (id) {
        const idx = linksData.findIndex(l => l.id === parseInt(id));
        if (idx >= 0) linksData[idx] = { ...linksData[idx], name, url, icon, desc };
    } else {
        const newId = linksData.length > 0 ? Math.max(...linksData.map(l => l.id)) + 1 : 1;
        linksData.push({ id: newId, name, url, icon, desc });
    }

    try {
        const res = await authFetch('/api/links', { method: 'POST', body: JSON.stringify(linksData) });
        if (res.ok) { hideLinkForm(); loadLinks(); }
        else { alert('Ошибка сохранения'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function deleteLink(id) {
    if (!confirm('Удалить ссылку?')) return;
    linksData = linksData.filter(l => l.id !== id);
    try {
        const res = await authFetch('/api/links', { method: 'POST', body: JSON.stringify(linksData) });
        if (res.ok) loadLinks();
    } catch(e) { alert('Ошибка сети'); }
}

let termHistory = [];
let termHistoryIdx = -1;

async function termExec(cmd) {
    if (!cmd) {
        const input = document.getElementById('terminalInput');
        cmd = input.value.trim();
        if (!cmd) return;
        input.value = '';
    }
    const output = document.getElementById('terminalOutput');
    output.textContent += '\n$ ' + cmd + '\n';
    output.scrollTop = output.scrollHeight;
    try {
        const res = await authFetch('/api/terminal/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, cwd: currentPath || undefined })
        });
        const data = await res.json();
        if (data.stdout) output.textContent += data.stdout;
        if (data.stderr) output.textContent += '\x1b[31m' + data.stderr + '\x1b[0m';
        if (data.exitCode && data.exitCode !== 0) output.textContent += '\n[Exit code: ' + data.exitCode + ']';
    } catch(e) {
        output.textContent += '\n[Ошибка: ' + e.message + ']';
    }
    output.scrollTop = output.scrollHeight;
    document.getElementById('terminalInput').focus();
}

function termClear() {
    document.getElementById('terminalOutput').textContent = 'Добро пожаловать в Web Terminal. Нажмите ⏎ чтобы выполнить команду.';
}

let allProcesses = [];

function updateProcStats(processes) {
    const total = processes.length;
    const cmdCounts = {};
    processes.forEach(p => {
        const cmd = p.cmd.split(' ')[0];
        cmdCounts[cmd] = (cmdCounts[cmd] || 0) + 1;
    });
    const unique = Object.keys(cmdCounts).length;
    const duplicates = Object.values(cmdCounts).filter(c => c > 1).length;
    document.getElementById('procStats').innerHTML = 'Статистика: <strong>' + total + '</strong> всего | <strong>' + unique + '</strong> уникальных | <strong>' + duplicates + '</strong> дублируется';
}

function renderProcesses(processes) {
    const tbody = document.getElementById('processTbody');
    tbody.innerHTML = '';
    processes.slice(0, 200).forEach(p => {
        const tr = document.createElement('tr');
        const cmdEscaped = p.cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        tr.innerHTML = '<td>' + p.pid + '</td><td>' + p.user + '</td><td>' + p.cpu + '</td><td>' + p.mem + '</td><td class="proc-cmd" title="' + cmdEscaped + '">' + cmdEscaped + '</td><td><button class="btn-kill" onclick="killProcess(' + p.pid + ')">Kill</button></td>';
        tbody.appendChild(tr);
    });
    if (processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Ничего не найдено</td></tr>';
    }
}

function filterProcesses() {
    const query = document.getElementById('procSearch').value.toLowerCase().trim();
    if (!query) {
        updateProcStats(allProcesses);
        renderProcesses(allProcesses);
        return;
    }
    const filtered = allProcesses.filter(p =>
        p.pid.includes(query) ||
        p.user.toLowerCase().includes(query) ||
        p.cmd.toLowerCase().includes(query)
    );
    updateProcStats(filtered);
    renderProcesses(filtered);
}

async function loadProcesses() {
    const tbody = document.getElementById('processTbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Загрузка...</td></tr>';
    try {
        const res = await authFetch('/api/processes');
        allProcesses = await res.json();
        document.getElementById('procSearch').value = '';
        updateProcStats(allProcesses);
        renderProcesses(allProcesses);
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger)">Ошибка загрузки</td></tr>';
    }
}

async function killProcess(pid) {
    if (!confirm('Убить процесс PID ' + pid + '?')) return;
    try {
        const res = await authFetch('/api/processes/kill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid })
        });
        if (res.ok) loadProcesses();
        else alert('Не удалось убить процесс');
    } catch(e) { alert('Ошибка сети'); }
}

// RAM History
const ramHistory = [];
let ramChartCtx = null;

function drawRamChart() {
    let canvas = document.getElementById('ramChart');
    if (!canvas) {
        // Create canvas inside RAM detail panel if not exists
        const detail = document.getElementById('detail-ram');
        if (!detail) return;
        canvas = document.createElement('canvas');
        canvas.id = 'ramChart';
        canvas.width = 310;
        canvas.height = 120;
        canvas.style.cssText = 'background:#121214;border:1px solid var(--border);border-radius:4px;margin-top:8px;display:block;width:100%;height:120px';
        detail.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (ramHistory.length < 2) return;
    const maxVal = Math.max(...ramHistory.map(d => d.total), 1);
    const pad = 4;
    const chartW = w - pad * 2, chartH = h - pad * 2;
    ctx.strokeStyle = '#04d361';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ramHistory.forEach((d, i) => {
        const x = pad + (i / (ramHistory.length - 1)) * chartW;
        const y = pad + chartH - (d.used / maxVal) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = ramHistory[ramHistory.length - 1];
    ctx.fillStyle = '#04d361';
    ctx.font = '10px monospace';
    ctx.fillText((last.used).toFixed(1) + 'G/' + (last.total).toFixed(1) + 'G', pad + 4, pad + 12);
}

async function loadLogs() {
    const name = document.getElementById('logSelector').value;
    const output = document.getElementById('logOutput');
    output.textContent = 'Загрузка...';
    try {
        const res = await authFetch('/api/logs?name=' + encodeURIComponent(name) + '&lines=100');
        const text = await res.text();
        output.textContent = text || '(пусто)';
    } catch(e) {
        output.textContent = 'Ошибка загрузки лога';
    }
}

async function searchFiles() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) return;
    const container = document.getElementById('filesContainer');
    container.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">Поиск...</div>';
    try {
        const res = await authFetch('/api/files/search?query=' + encodeURIComponent(query) + '&dir=' + encodeURIComponent(currentPath || '/data/data/com.termux/files/home'));
        const files = await res.json();
        container.innerHTML = '';
        if (files.length === 0) {
            container.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">Ничего не найдено</div>';
            return;
        }
        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = '<span>📄 ' + f.name + '</span><span style="font-size:11px;color:var(--text-secondary)">...</span>';
            div.onclick = () => openFile(f.fullPath);
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<div style="padding:10px;color:var(--danger)">Ошибка поиска</div>';
    }
}

async function loadBattery() {
    try {
        const res = await authFetch('/api/battery');
        const b = await res.json();
        if (b.percentage !== undefined) {
            const icon = b.status.toUpperCase() === 'CHARGING' ? '⚡' : (b.percentage > 50 ? '🔋' : '🪫');
            document.getElementById('batteryLevel').innerText = b.percentage + '%';
            document.getElementById('batteryStatus').innerText = icon + ' ' + (b.status.toUpperCase() === 'CHARGING' ? '\u0417\u0430\u0440\u044f\u0436\u0430\u0435\u0442\u0441\u044f' : '\u0420\u0430\u0437\u0440\u044f\u0436\u0430\u0435\u0442\u0441\u044f');
        }
    } catch(e) {
        document.getElementById('batteryLevel').innerText = '-';
        document.getElementById('batteryStatus').innerText = '';
    }
}

let logRawMode = true;
let logData = '';

function toggleLogView() {
    logRawMode = !logRawMode;
    document.getElementById('logViewToggle').textContent = logRawMode ? '📋 Структура' : '📄 Сырой';
    renderLogs();
}

function renderLogs() {
    const output = document.getElementById('logOutput');
    if (logRawMode) {
        output.innerHTML = logData;
        return;
    }
    const lines = logData.split('\n').filter(Boolean);
    let table = '<table class="log-table"><thead><tr><th>Время</th><th>Статус</th><th>Событие</th></tr></thead><tbody>';
    lines.forEach(line => {
        let status = 'INFO';
        let cls = 'log-info';
        if (/error|errno|EADDR|fail|trace|warn|throw/i.test(line)) {
            status = 'ERROR';
            cls = 'log-error';
            if (/warn/i.test(line)) { status = 'WARN'; cls = 'log-warn'; }
        } else if (/started|ok|success|Запущен/i.test(line)) {
            status = 'OK';
            cls = 'log-ok';
        } else if (/nodemon|restart|change/i.test(line)) {
            status = 'WATCH';
            cls = 'log-watch';
        }
        const ts = line.match(/^\[?([\d:.-]+)\]?/) || ['', ''];

        // Truncate long lines
        const short = line.length > 120 ? line.slice(0, 120) + '...' : line;

        table += '<tr class="' + cls + '"><td>' + ts[1] + '</td><td><span class="log-badge ' + cls + '">' + status + '</span></td><td>' + escapeHtml(short) + '</td></tr>';
    });
    table += '</tbody></table>';
    output.innerHTML = table;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Override loadLogs to store data and render
const _origLoadLogs = loadLogs;
loadLogs = async function() {
    const name = document.getElementById('logSelector').value;
    const output = document.getElementById('logOutput');
    output.textContent = 'Загрузка...';
    try {
        const res = await authFetch('/api/logs?name=' + encodeURIComponent(name) + '&lines=100');
        logData = await res.text();
        if (logRawMode) {
            output.textContent = logData || '(пусто)';
        } else {
            renderLogs();
        }
    } catch(e) {
        output.textContent = 'Ошибка загрузки лога';
    }
};


let lastMetricType = '';

function closeMetric() {
    document.getElementById('metricPanel').style.display = 'none';
    document.querySelector('.file-list').style.display = '';
    document.querySelector('.editor-zone').style.display = '';
    document.getElementById('ramChart').style.display = 'none';
    lastMetricType = '';
}

async function showMetric(type) {
    lastMetricType = type;
    document.querySelector('.file-list').style.display = 'none';
    document.querySelector('.editor-zone').style.display = 'none';
    const panel = document.getElementById('metricPanel');
    panel.style.display = 'block';
    const title = document.getElementById('metricPanelTitle');
    const body = document.getElementById('metricPanelBody');
    const chart = document.getElementById('ramChart');
    chart.style.display = 'none';

    const res = await authFetch('/api/stats');
    const d = await res.json();

    switch(type) {
        case 'os':
            title.innerText = 'ОС / Окружение';
            body.innerHTML = '<div class="detail-row"><span class="detail-label">Хост</span><span>' + (d.osFull?.hostname || '-') + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Платформа</span><span>' + (d.osFull?.platform || '-') + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Архитектура</span><span>' + (d.osFull?.arch || '-') + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Ядро</span><span>' + (d.osFull?.release || '-') + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">ОС</span><span>' + d.os + '</span></div>';
            break;
        case 'ram':
            title.innerText = 'Оперативная память';
            const ramPct = parseFloat(d.ramUsed) / parseFloat(d.ramTotal) * 100;
            body.innerHTML = '<div class="progress-bar"><div class="progress-fill" style="width:' + Math.min(ramPct, 100) + '%"></div></div>' +
                '<div class="detail-row"><span class="detail-label">Всего</span><span>' + d.ramTotal + ' ГБ</span></div>' +
                '<div class="detail-row"><span class="detail-label">Использовано</span><span>' + d.ramUsed + ' ГБ</span></div>' +
                '<div class="detail-row"><span class="detail-label">Свободно</span><span>' + d.ramFree + ' ГБ</span></div>';
            chart.style.display = 'block';
            chart.width = chart.clientWidth || 310;
            chart.height = chart.clientHeight || 120;
            setTimeout(drawRamChart, 50);
            break;
        case 'disk':
            title.innerText = 'Накопитель';
            const du = parseFloat(d.diskUsed);
            const dt = parseFloat(d.diskTotal);
            const diskPct = (!isNaN(du) && !isNaN(dt) && dt > 0) ? (du / dt * 100) : 0;
            body.innerHTML = '<div class="progress-bar"><div class="progress-fill disk-fill" style="width:' + Math.min(diskPct, 100) + '%"></div></div>' +
                '<div class="detail-row"><span class="detail-label">Всего</span><span>' + d.diskTotal + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Использовано</span><span>' + d.diskUsed + '</span></div>';
            break;
        case 'net':
            title.innerText = 'Сетевые интерфейсы';
            let netHtml = '';
            if (d.network) {
                d.network.forEach(function(n) {
                    netHtml += '<div class="detail-row"><span class="detail-label">' + n.name + '</span><span>' + n.address + (n.internal ? ' (внутренний)' : '') + '</span></div>';
                });
            }
            body.innerHTML = netHtml || '<div class="detail-row"><span class="detail-label">Нет данных</span></div>';
            break;
        case 'uptime':
            title.innerText = 'Время работы';
            const u = d.uptimeFull || {};
            body.innerHTML = '<div class="detail-row"><span class="detail-label">Дней</span><span>' + (u.days || 0) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Часов</span><span>' + (u.hours || 0) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Минут</span><span>' + (u.minutes || 0) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">Нагрузка (1/5/15)</span><span>' + (d.loadAvg ? d.loadAvg.one + ' / ' + d.loadAvg.five + ' / ' + d.loadAvg.fifteen : '-') + '</span></div>';
            break;
        case 'battery':
            title.innerText = 'Батарея';
            const batRes = await authFetch('/api/battery');
            const b = await batRes.json();
            if (b.percentage !== undefined) {
                body.innerHTML = '<div class="detail-row"><span class="detail-label">Заряд</span><span>' + b.percentage + '%</span></div>' +
                    '<div class="detail-row"><span class="detail-label">Статус</span><span>' + (b.status === 'CHARGING' ? '⚡ Заряжается' : '🔋 Разряжается') + '</span></div>' +
                    '<div class="detail-row"><span class="detail-label">Температура</span><span>' + (b.temperature || '-') + '°C</span></div>' +
                    '<div class="detail-row"><span class="detail-label">Вольтаж</span><span>' + (b.voltage ? (b.voltage/1000).toFixed(3) + 'V' : '-') + '</span></div>' +
                    '<div class="detail-row"><span class="detail-label">Здоровье</span><span>' + (b.health || '-') + '</span></div>' +
                    '<div class="detail-row"><span class="detail-label">Циклы</span><span>' + (b.cycle || '-') + '</span></div>';
            }
            break;
    }
}

function updateTermPrompt() {
    var prompt = document.getElementById('termPrompt');
    if (prompt) {
        var p = currentPath || '/data/data/com.termux/files/home';
        prompt.textContent = (p === '/data/data/com.termux/files/home' ? '~' : p.replace('/data/data/com.termux/files/home/', '~/')) + '$';
    }
}


// --- Service Management ---

async function loadServices() {
    try {
        const res = await authFetch('/api/services');
        const services = await res.json();
        const container = document.getElementById('servicesContainer');
        container.innerHTML = '';
        services.forEach(s => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '20px';
            const statusColor = s.running ? '#04d361' : '#e53e3e';
            const statusText = s.running ? 'Работает' : 'Остановлена';
            const btnAction = s.running ? 'stop' : 'start';
            const btnLabel = s.running ? '\u23f9 Остановить' : '\u25b6 Запустить';
            const btnClass = s.running ? 'btn-stop' : 'btn-start';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                    <div>
                        <h3 style="margin:0">${s.icon} ${s.label}</h3>
                        <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary)">${s.desc}</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${statusColor}"></span>
                        <span style="font-size:13px;font-weight:bold;color:${statusColor}">${statusText}</span>
                    </div>
                </div>
                <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
                    <button class="service-btn ${btnClass}" onclick="toggleService('${s.id}', '${btnAction}')">${btnLabel}</button>
                    <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
                        <span style="font-size:13px;color:var(--text-secondary)">Автозапуск</span>
                        <label class="toggle-switch">
                            <input type="checkbox" ${s.autostart ? 'checked' : ''} onchange="toggleAutostart('${s.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch(e) { console.error('loadServices:', e); }
}

async function toggleService(name, action) {
    try {
        const res = await authFetch('/api/services/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            setTimeout(loadServices, 1500);
        } else {
            const data = await res.json();
            alert('\u041e\u0448\u0438\u0431\u043a\u0430: ' + (data.error || '\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u0430'));
        }
    } catch(e) { alert('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0442\u0438'); }
}

async function toggleAutostart(name, enabled) {
    try {
        const res = await authFetch('/api/services/autostart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, enabled })
        });
        if (!res.ok) {
            alert('\u041e\u0448\u0438\u0431\u043a\u0430 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0430\u0432\u0442\u043e\u0437\u0430\u043f\u0443\u0441\u043a\u0430');
            loadServices();
        }
    } catch(e) { alert('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0442\u0438'); }
}

// Запуск инициализации при загрузке скрипта
window.addEventListener('DOMContentLoaded', () => {
    updateStats();
    initRefreshSettings();
    loadFiles();
    loadTunnelLinks();
    updateTunnelLinks();
    loadLinks();
    loadProcesses();
    loadServices();
    // Battery refresh every 60s (not on every stats tick)
    setInterval(loadBattery, 60000);
});