let lastMetric = null;
let lastMetricType = '';
const ramHistory = [];
let tunnelPollInterval = null;

async function updateStats() {
    try {
        const res = await authFetch('/api/stats');
        const d = await res.json();
        deviceIP = d.ip;

        const osEl = document.getElementById('os');
        if (osEl) osEl.innerText = d.os;

        const ramUsed = parseFloat(d.ramUsed) || 0;
        const ramTotal = parseFloat(d.ramTotal) || 1;
        const ramFree = parseFloat(d.ramFree) || 0;
        const ramPct = Math.min(Math.round((ramUsed / ramTotal) * 100), 100);

        const ruEl = document.getElementById('ramUsed');
        const rtEl = document.getElementById('ramTotal');
        const rfEl = document.getElementById('ramFree');
        if (ruEl) ruEl.innerText = ramUsed.toFixed(1);
        if (rtEl) rtEl.innerText = ramTotal.toFixed(1);
        if (rfEl) rfEl.innerText = ramFree.toFixed(1);

        const ramFill = document.getElementById('ramProgressFill');
        if (ramFill) {
            ramFill.style.width = ramPct + '%';
            ramFill.className = 'progress-fill' + (ramPct > 90 ? ' danger' : (ramPct > 75 ? ' warn' : ''));
        }

        const duEl = document.getElementById('diskUsed');
        const dtEl = document.getElementById('diskTotal');
        if (duEl) duEl.innerText = d.diskUsed || '-';
        if (dtEl) dtEl.innerText = d.diskTotal || '-';

        const diskFill = document.getElementById('diskProgressFill');
        if (diskFill && d.diskUsed && d.diskTotal) {
            const duVal = parseFloat(d.diskUsed);
            const dtVal = parseFloat(d.diskTotal);
            if (!isNaN(duVal) && !isNaN(dtVal) && dtVal > 0) {
                const diskPct = Math.min(Math.round((duVal / dtVal) * 100), 100);
                diskFill.style.width = diskPct + '%';
            }
        }

        const ipEl = document.getElementById('ip');
        if (ipEl) ipEl.innerText = d.ip;

        const upEl = document.getElementById('uptime');
        if (upEl) upEl.innerText = d.uptime;

        const cpuEl = document.getElementById('cpuLoad');
        if (cpuEl && d.loadAvg) {
            cpuEl.innerText = `${d.loadAvg.one} / ${d.loadAvg.five}`;
        }

        ramHistory.push({ used: ramUsed, total: ramTotal, pct: ramPct });
        if (ramHistory.length > 60) ramHistory.shift();

        loadBattery(d);
        drawRamChart();
    } catch(e) {}
}

async function loadBattery(statsData = null) {
    try {
        const res = await authFetch('/api/battery');
        const b = await res.json();
        const pct = b.percentage !== undefined ? b.percentage : b.level;

        if (pct !== undefined && pct !== null) {
            const rawStatus = (b.status || '').toUpperCase();
            const rawPlugged = (b.plugged || '').toUpperCase();
            const isPlugged = rawPlugged.startsWith('PLUGGED') && rawPlugged !== 'UNPLUGGED';
            const isFull = rawStatus === 'FULL' || (pct >= 100 && isPlugged);
            const isCharging = rawStatus === 'CHARGING';

            let modeText = 'Разряжается';
            let icon = pct > 50 ? '🔋' : (pct > 20 ? '🪫' : '⚠️');

            if (isFull && isPlugged) {
                modeText = 'Заряжена (сеть)';
                icon = '🟢';
            } else if (isCharging || isPlugged) {
                modeText = rawPlugged.includes('USB') ? 'Зарядка (USB)' : 'Заряжается';
                icon = '⚡';
            }

            const lvlEl = document.getElementById('batteryLevel');
            const stEl = document.getElementById('batteryStatus');
            const iconEl = document.getElementById('batteryIcon');
            const fillEl = document.getElementById('batteryProgressFill');

            if (lvlEl) lvlEl.innerText = pct + '%';
            if (stEl) stEl.innerText = modeText + (b.temperature ? ` (${b.temperature}°C)` : '');
            if (iconEl) iconEl.innerText = icon;

            if (fillEl) {
                fillEl.style.width = Math.min(pct, 100) + '%';
                fillEl.className = 'progress-fill' + (pct <= 20 ? ' danger' : (pct <= 40 ? ' warn' : ''));
            }

            const headerBatText = `${icon} ${pct}%`;
            const ip = statsData ? statsData.ip : deviceIP;
            const uptime = statsData ? statsData.uptime : undefined;
            updateHeaderPills(ip, uptime, headerBatText);
        }
    } catch(e) {
        const lvlEl = document.getElementById('batteryLevel');
        if (lvlEl) lvlEl.innerText = '-';
        const stEl = document.getElementById('batteryStatus');
        if (stEl) stEl.innerText = 'Недоступно';
    }
}

function drawRamChart() {
    const canvas = document.getElementById('ramChart');
    if (!canvas || ramHistory.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 130;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = 12;
    const chartW = w - pad * 2;
    const chartH = h - pad * 2;

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
        const y = pad + (chartH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + chartW, y);
        ctx.stroke();
    }

    const maxVal = Math.max(...ramHistory.map(d => d.total), 1);

    // Compute coordinates
    const points = ramHistory.map((d, i) => ({
        x: pad + (i / (ramHistory.length - 1)) * chartW,
        y: pad + chartH - (d.used / maxVal) * chartH
    }));

    // Draw gradient area under the line
    const gradient = ctx.createLinearGradient(0, pad, 0, pad + chartH);
    gradient.addColorStop(0, 'rgba(4, 211, 97, 0.35)');
    gradient.addColorStop(1, 'rgba(4, 211, 97, 0.0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad + chartH);
    ctx.closePath();
    ctx.fill();

    // Draw smooth line
    ctx.strokeStyle = '#04d361';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Draw current value label
    const last = ramHistory[ramHistory.length - 1];
    ctx.fillStyle = '#04d361';
    ctx.font = '11px monospace';
    ctx.fillText(`${last.used.toFixed(1)}G / ${last.total.toFixed(1)}G (${last.pct}%)`, pad + 4, pad + 14);

    ctx.restore();
}

async function showMetric(type) {
    lastMetricType = type;
    const fileList = document.querySelector('.file-list');
    const editorZone = document.querySelector('.editor-zone');
    const panel = document.getElementById('metricPanel');
    const chartContainer = document.getElementById('ramChartContainer');

    if (fileList) fileList.style.display = 'none';
    if (editorZone) editorZone.style.display = 'none';
    if (panel) panel.style.display = 'block';

    const title = document.getElementById('metricPanelTitle');
    const body = document.getElementById('metricPanelBody');
    if (chartContainer) chartContainer.style.display = (type === 'ram') ? 'block' : 'none';

    try {
        const res = await authFetch('/api/stats');
        const d = await res.json();

        switch(type) {
            case 'os':
                if (title) title.innerText = '📱 ОС и окружение';
                if (body) {
                    body.innerHTML = `
                        <div class="detail-row"><span class="detail-label">Имя хоста</span><span>${d.osFull?.hostname || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Платформа</span><span>${d.osFull?.platform || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Архитектура</span><span>${d.osFull?.arch || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Ядро Linux</span><span>${d.osFull?.release || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Дистрибутив</span><span>${d.os}</span></div>
                    `;
                }
                break;
            case 'ram':
                if (title) title.innerText = '🧠 Оперативная память';
                const ramPct = Math.min(Math.round((parseFloat(d.ramUsed) / parseFloat(d.ramTotal)) * 100), 100);
                if (body) {
                    body.innerHTML = `
                        <div class="progress-bar" style="margin-bottom:12px">
                            <div class="progress-fill" style="width:${ramPct}%"></div>
                        </div>
                        <div class="detail-row"><span class="detail-label">Всего</span><span>${d.ramTotal} ГБ</span></div>
                        <div class="detail-row"><span class="detail-label">Использовано</span><span>${d.ramUsed} ГБ (${ramPct}%)</span></div>
                        <div class="detail-row"><span class="detail-label">Свободно</span><span>${d.ramFree} ГБ</span></div>
                    `;
                }
                setTimeout(drawRamChart, 50);
                break;
            case 'disk':
                if (title) title.innerText = '💾 Накопитель Termux';
                const du = parseFloat(d.diskUsed);
                const dt = parseFloat(d.diskTotal);
                const diskPct = (!isNaN(du) && !isNaN(dt) && dt > 0) ? Math.min(Math.round(du / dt * 100), 100) : 0;
                if (body) {
                    body.innerHTML = `
                        <div class="progress-bar" style="margin-bottom:12px">
                            <div class="progress-fill disk-fill" style="width:${diskPct}%"></div>
                        </div>
                        <div class="detail-row"><span class="detail-label">Всего</span><span>${d.diskTotal}</span></div>
                        <div class="detail-row"><span class="detail-label">Использовано</span><span>${d.diskUsed} (${diskPct}%)</span></div>
                    `;
                }
                break;
            case 'net':
                if (title) title.innerText = '🌐 Сетевые интерфейсы';
                let netHtml = '';
                if (d.network && d.network.length > 0) {
                    d.network.forEach(n => {
                        netHtml += `<div class="detail-row"><span class="detail-label">${n.name}</span><span style="font-family:monospace">${n.address}${n.internal ? ' (внутр.)' : ''}</span></div>`;
                    });
                } else {
                    netHtml = '<div class="detail-row"><span class="detail-label">Нет данных</span></div>';
                }
                if (body) body.innerHTML = netHtml;
                break;
            case 'uptime':
                if (title) title.innerText = '⏱ Аптайм и нагрузка CPU';
                const u = d.uptimeFull || {};
                if (body) {
                    body.innerHTML = `
                        <div class="detail-row"><span class="detail-label">Дней</span><span>${u.days || 0}</span></div>
                        <div class="detail-row"><span class="detail-label">Часов</span><span>${u.hours || 0}</span></div>
                        <div class="detail-row"><span class="detail-label">Минут</span><span>${u.minutes || 0}</span></div>
                        <div class="detail-row"><span class="detail-label">Load Average (1/5/15)</span><span style="font-family:monospace">${d.loadAvg ? `${d.loadAvg.one} / ${d.loadAvg.five} / ${d.loadAvg.fifteen}` : '-'}</span></div>
                    `;
                }
                break;
            case 'battery':
                if (title) title.innerText = '🔋 Аккумулятор Redmi';
                const batRes = await authFetch('/api/battery');
                const b = await batRes.json();
                if (b.percentage !== undefined && body) {
                    const isCharging = (b.status || '').toUpperCase() === 'CHARGING';
                    body.innerHTML = `
                        <div class="detail-row"><span class="detail-label">Уровень заряда</span><span><b>${b.percentage}%</b></span></div>
                        <div class="detail-row"><span class="detail-label">Режим питания</span><span>${isCharging ? '⚡ Зарядка подключена' : '🔋 Работа от батареи'}</span></div>
                        <div class="detail-row"><span class="detail-label">Температура</span><span>${b.temperature || '-'}°C</span></div>
                        <div class="detail-row"><span class="detail-label">Напряжение</span><span>${b.voltage ? (b.voltage/1000).toFixed(3) + ' В' : '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Состояние здоровья</span><span>${b.health || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Циклов перезарядки</span><span>${b.cycle || b.cycles || '-'}</span></div>
                    `;
                }
                break;
        }
    } catch(e) {}
}

function closeMetric() {
    const panel = document.getElementById('metricPanel');
    const fileList = document.querySelector('.file-list');
    const editorZone = document.querySelector('.editor-zone');
    const chartContainer = document.getElementById('ramChartContainer');

    if (panel) panel.style.display = 'none';
    if (fileList) fileList.style.display = '';
    if (editorZone) editorZone.style.display = '';
    if (chartContainer) chartContainer.style.display = 'none';
    lastMetricType = '';
}

function copyTunnelUrl(linkId) {
    const link = document.getElementById(linkId);
    if (!link || !link.href || link.href === '#' || link.href.includes('Недоступен')) {
        showToast('Ссылка еще недоступна', 'warn');
        return;
    }
    copyToClipboard(link.href, 'Ссылка скопирована!');
}

async function loadTunnelLinks() {
    try {
        await authFetch('/api/tunnel/links');
    } catch (e) {}
}

async function updateTunnelLinks() {
    try {
        const response = await authFetch('/api/tunnel/links');
        const data = await response.json();

        const panelLink = document.getElementById('tunnel-panel-link');
        const ideLink = document.getElementById('tunnel-ide-link');
        const panelStatus = document.getElementById('tunnel-panel-status');
        const ideStatus = document.getElementById('tunnel-ide-status');

        if (panelStatus) {
            if (data.status === 'restarting') {
                panelStatus.innerHTML = '<span style="color:#ff9800">⏳ Запуск...</span>';
            } else if (data.panelRunning && data.panelUrl && data.panelUrl.startsWith('http')) {
                panelStatus.innerHTML = '<span style="color:#04d361">🟢 Онлайн</span>';
            } else if (data.panelRunning) {
                panelStatus.innerHTML = '<span style="color:#ff9800">🟡 Инициализация...</span>';
            } else {
                panelStatus.innerHTML = '<span style="color:#e53e3e">🔴 Остановлен</span>';
            }
        }

        if (ideStatus) {
            if (data.status === 'restarting') {
                ideStatus.innerHTML = '<span style="color:#ff9800">⏳ Запуск...</span>';
            } else if (data.ideRunning && data.ideUrl && data.ideUrl.startsWith('http')) {
                ideStatus.innerHTML = '<span style="color:#04d361">🟢 Онлайн</span>';
            } else if (data.ideRunning) {
                ideStatus.innerHTML = '<span style="color:#ff9800">🟡 Инициализация...</span>';
            } else {
                ideStatus.innerHTML = '<span style="color:#e53e3e">🔴 Остановлен</span>';
            }
        }

        if (panelLink) {
            if (data.panelUrl && data.panelUrl.startsWith('http')) {
                panelLink.href = data.panelUrl;
                panelLink.innerText = "Панель: " + data.panelUrl.replace(/^https?:\/\//, '').slice(0, 24) + '...';
                panelLink.style.pointerEvents = 'auto';
                panelLink.style.opacity = '1';
            } else {
                panelLink.removeAttribute('href');
                panelLink.innerText = data.panelUrl || "Недоступен";
                panelLink.style.pointerEvents = 'none';
                panelLink.style.opacity = '0.6';
            }
        }

        if (ideLink) {
            if (data.ideUrl && data.ideUrl.startsWith('http')) {
                ideLink.href = data.ideUrl + "/?folder=/data/data/com.termux/files/home/projects/main-server";
                ideLink.innerText = "🚀 Открыть IDE с кодом";
                ideLink.style.pointerEvents = 'auto';
                ideLink.style.opacity = '1';
            } else {
                ideLink.removeAttribute('href');
                ideLink.innerText = data.ideUrl || "Недоступен";
                ideLink.style.pointerEvents = 'none';
                ideLink.style.opacity = '0.6';
            }
        }

        return data;
    } catch (error) {}
}

async function restartTunnels() {
    const confirmed = await confirmModal({
        title: 'Перезапуск туннелей Cloudflare',
        message: 'Вы уверены? Будут сгенерированы новые публичные адреса доступа.',
        confirmText: 'Перезапустить',
        danger: false
    });
    if (!confirmed) return;

    const btn = document.getElementById('tunnel-restart-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Перезапуск туннелей...';
    }

    showToast('Перезапуск туннелей Cloudflare...', 'info');

    try {
        await authFetch('/api/tunnel/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'all' })
        });
    } catch (e) {
        showToast('Ошибка при отправке команды перезапуска', 'error');
    }

    if (tunnelPollInterval) clearInterval(tunnelPollInterval);
    let attempts = 0;

    tunnelPollInterval = setInterval(async () => {
        attempts++;
        const state = await updateTunnelLinks();
        if ((state && state.status === 'ready' && state.panelRunning && state.ideRunning) || attempts >= 15) {
            clearInterval(tunnelPollInterval);
            tunnelPollInterval = null;
            if (btn) {
                btn.disabled = false;
                btn.innerText = '🔄 Перезапустить туннели';
            }
            showToast('Туннели успешно подняты!', 'success');
        }
    }, 2000);
}

async function loadProjectsForIDE() {
    try {
        const res = await authFetch('/api/files/list?path=' + encodeURIComponent('/data/data/com.termux/files/home/projects'));
        const data = await res.json();
        const container = document.getElementById('projectsIdeContainer');
        if (!container) return;
        container.innerHTML = '';

        // Check if user is accessing via Cloudflare tunnel
        let baseUrl = `http://${deviceIP}:8085`;
        try {
            const tRes = await authFetch('/api/tunnel/links');
            const tData = await tRes.json();
            if (window.location.hostname.includes('trycloudflare.com') && tData.ideUrl && tData.ideUrl.startsWith('http')) {
                baseUrl = tData.ideUrl;
            }
        } catch(e) {}

        const dirs = data.files.filter(f => f.isDir);
        if (dirs.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary)">Папок проектов не найдено в ~/projects</p>';
            return;
        }

        dirs.forEach(p => {
            const card = document.createElement('div');
            card.className = 'link-card';
            card.innerHTML = `
                <div class="link-card-header">
                    <span class="link-icon">📁</span>
                    <div>
                        <h3>${escapeHtml(p.name)}</h3>
                        <span style="font-size:11px;color:var(--text-muted);font-family:monospace">${escapeHtml(p.fullPath)}</span>
                    </div>
                </div>
                <p>Открыть рабочую область проекта в редакторе code-server</p>
                <div class="link-card-actions">
                    <a href="${baseUrl}/?folder=${encodeURIComponent(p.fullPath)}" target="_blank" class="btn-link-open">🚀 Открыть в IDE</a>
                </div>
            `;
            container.appendChild(card);
        });
    } catch(e) {
        const container = document.getElementById('projectsIdeContainer');
        if (container) container.innerHTML = '<p style="color:var(--danger)">Не удалось загрузить проекты</p>';
    }
}

async function triggerSystemRestart() {
    const confirmed = await confirmModal({
        title: 'Перезапуск сервера',
        message: 'Принудительно перезапустить все системные службы и сервер? Веб-панель перезагрузится через несколько секунд.',
        confirmText: 'Перезапустить всё',
        danger: true
    });
    if (!confirmed) return;

    showToast('Перезапуск сервера...', 'warn', 4000);
    try {
        await authFetch('/api/system/restart', { method: 'POST' });
    } catch(e) {}

    setTimeout(() => {
        window.location.reload();
    }, 3500);
}

// ═══════════════════ TELEGRAM MODAL ═══════════════════
async function openTelegramModal() {
    const overlay = document.getElementById('telegramOverlay');
    const statusMsg = document.getElementById('tgStatusMsg');
    if (statusMsg) statusMsg.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';

    try {
        const res = await authFetch('/api/settings/telegram');
        const data = await res.json();
        if (data) {
            document.getElementById('tgBotToken').value = data.botTokenMasked || '';
            document.getElementById('tgChatId').value = data.chatId || '';
            document.getElementById('tgNotifyOnRestart').checked = data.notifyOnTunnelRestart !== false;
            document.getElementById('tgNotifyOnAuthFailure').checked = data.notifyOnAuthFailure !== false;
            document.getElementById('tgNotifyOnBatteryAlert').checked = data.notifyOnBatteryAlert !== false;
            document.getElementById('tgNotifyOnServerError').checked = data.notifyOnServerError !== false;
            
            if (data.configured) {
                showTgStatus('✅ Бот настроен и готов к работе.', 'var(--accent)');
            } else {
                showTgStatus('ℹ️ Токен бота еще не задан.', 'var(--warning)');
            }
        }
    } catch (e) {}
}

function closeTelegramModal() {
    const overlay = document.getElementById('telegramOverlay');
    if (overlay) overlay.style.display = 'none';
}

function toggleTgTokenVisibility() {
    const input = document.getElementById('tgBotToken');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function showTgStatus(msg, color = '#fff') {
    const el = document.getElementById('tgStatusMsg');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = color;
    el.innerHTML = msg;
}

async function saveTelegramSettings() {
    const btn = document.getElementById('tgSaveBtn');
    const botToken = document.getElementById('tgBotToken').value.trim();
    const chatId = document.getElementById('tgChatId').value.trim();
    const notifyOnTunnelRestart = document.getElementById('tgNotifyOnRestart').checked;
    const notifyOnAuthFailure = document.getElementById('tgNotifyOnAuthFailure').checked;
    const notifyOnBatteryAlert = document.getElementById('tgNotifyOnBatteryAlert').checked;
    const notifyOnServerError = document.getElementById('tgNotifyOnServerError').checked;

    if (btn) btn.disabled = true;
    showTgStatus('⏳ Сохранение...', 'var(--warning)');

    try {
        const res = await authFetch('/api/settings/telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botToken,
                chatId,
                notifyOnTunnelRestart,
                notifyOnAuthFailure,
                notifyOnBatteryAlert,
                notifyOnServerError
            })
        });
        const data = await res.json();
        if (data && data.success) {
            showTgStatus('✅ Настройки успешно сохранены!', 'var(--accent)');
            showToast('Настройки Telegram сохранены', 'success');
            if (data.settings && data.settings.botTokenMasked) {
                document.getElementById('tgBotToken').value = data.settings.botTokenMasked;
            }
        } else {
            showTgStatus('❌ ' + (data.error || 'Ошибка сохранения'), 'var(--danger)');
        }
    } catch (e) {
        showTgStatus('❌ Ошибка сети при сохранении', 'var(--danger)');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function testTelegramSettings() {
    const btn = document.getElementById('tgTestBtn');
    const botToken = document.getElementById('tgBotToken').value.trim();
    const chatId = document.getElementById('tgChatId').value.trim();

    if (btn) btn.disabled = true;
    showTgStatus('⏳ Отправка теста...', 'var(--warning)');

    try {
        const payload = {};
        if (botToken && !botToken.includes('...')) payload.botToken = botToken;
        if (chatId) payload.chatId = chatId;

        const res = await authFetch('/api/settings/telegram/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data && data.success) {
            showTgStatus('✅ Сообщение доставлено в Telegram!', 'var(--accent)');
            showToast('Тестовое сообщение отправлено в Telegram', 'success');
        } else {
            showTgStatus('❌ ' + (data.error || 'Сбой отправки теста'), 'var(--danger)');
        }
    } catch (e) {
        showTgStatus('❌ Ошибка сети при отправке теста', 'var(--danger)');
    } finally {
        if (btn) btn.disabled = false;
    }
}
