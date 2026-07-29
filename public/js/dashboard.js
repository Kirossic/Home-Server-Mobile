let lastMetric = null;
let lastMetricType = '';
let openFilePath = '';
const ramHistory = [];
let ramChartCtx = null;

function toggleMetric(el) {
    const detail = el.querySelector('.metric-detail');
    const arrow = el.querySelector('.metric-arrow');
    if (!detail) return;
    if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
        arrow.textContent = '▸';
        return;
    }
    if (lastMetric && lastMetric !== el) {
        lastMetric.classList.remove('expanded');
        const prevArrow = lastMetric.querySelector('.metric-arrow');
        if (prevArrow) prevArrow.textContent = '▸';
    }
    el.classList.add('expanded');
    arrow.textContent = '▾';
    lastMetric = el;
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

        ramHistory.push({ used: parseFloat(d.ramUsed), total: parseFloat(d.ramTotal) });
        if (ramHistory.length > 60) ramHistory.shift();
        drawRamChart();
    } catch(e) {}
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

function drawRamChart() {
    let canvas = document.getElementById('ramChart');
    if (!canvas) {
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

function closeMetric() {
    document.getElementById('metricPanel').style.display = 'none';
    document.querySelector('.file-list').style.display = '';
    document.querySelector('.editor-zone').style.display = '';
    document.getElementById('ramChart').style.display = 'none';
    lastMetricType = '';
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
            ideLink.href = data.ideUrl + "/?folder=/data/data/com.termux/files/home/projects/main-server";
            ideLink.innerText = data.ideUrl.includes('trycloudflare') ? "🚀 Открыть IDE с кодом" : data.ideUrl;
        }
    } catch (error) {
        console.error("Ошибка обновления ссылок:", error);
    }
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
            a.href = 'http://' + deviceIP + ':8085/?folder=' + encodeURIComponent(p.fullPath);
            a.target = '_blank';
            a.innerHTML = '<h3>📁 ' + p.name + '</h3><p>Открыть папку напрямую в IDE</p>';
            container.appendChild(a);
        });
    } catch(e) {}
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
