let logRawMode = true;
let logData = '';
let liveTailTimer = null;

async function loadLogs() {
    const nameEl = document.getElementById('logSelector');
    const name = nameEl ? nameEl.value : 'main-server';
    const output = document.getElementById('logOutput');
    if (!output) return;

    if (!liveTailTimer && output.textContent === 'Выберите лог-файл и нажмите 🔄') {
        output.textContent = 'Загрузка логов...';
    }

    try {
        const res = await authFetch('/api/logs?name=' + encodeURIComponent(name) + '&lines=200');
        logData = await res.text();
        renderLogs();

        if (liveTailTimer) {
            output.scrollTop = output.scrollHeight;
        }
    } catch(e) {
        if (!liveTailTimer) {
            output.textContent = 'Ошибка загрузки лога: ' + (e.message || 'сеть');
        }
    }
}

function toggleLogView() {
    logRawMode = !logRawMode;
    const toggleBtn = document.getElementById('logViewToggle');
    if (toggleBtn) {
        toggleBtn.textContent = logRawMode ? '📋 Структура' : '📄 Сырой текст';
    }
    renderLogs();
}

function filterLogsInPlace() {
    renderLogs();
}

function renderLogs() {
    const output = document.getElementById('logOutput');
    const filterText = (document.getElementById('logSearchInput')?.value || '').toLowerCase().trim();
    if (!output) return;

    let lines = (logData || '').split('\n');

    if (filterText) {
        lines = lines.filter(l => l.toLowerCase().includes(filterText));
    }

    if (logRawMode) {
        output.textContent = lines.join('\n') || (filterText ? '(По запросу ничего не найдено)' : '(Лог пуст)');
        return;
    }

    const filteredLines = lines.filter(Boolean);
    if (filteredLines.length === 0) {
        output.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Нет записей</div>';
        return;
    }

    let table = '<table class="log-table"><thead><tr><th>Время</th><th>Уровень</th><th>Сообщение</th></tr></thead><tbody>';

    filteredLines.forEach(line => {
        let status = 'INFO';
        let cls = 'log-info';

        if (/error|errno|EADDR|fail|trace|throw|exception/i.test(line)) {
            status = 'ERROR';
            cls = 'log-error';
        } else if (/warn/i.test(line)) {
            status = 'WARN';
            cls = 'log-warn';
        } else if (/started|ready|ok|success|Запущен|listening/i.test(line)) {
            status = 'OK';
            cls = 'log-ok';
        } else if (/nodemon|restart|watchdog|change/i.test(line)) {
            status = 'WATCH';
            cls = 'log-watch';
        }

        const tsMatch = line.match(/^\[?([\d\s:.-]+)\]?/);
        const ts = tsMatch ? tsMatch[1] : '';
        const cleanLine = tsMatch ? line.slice(tsMatch[0].length).trim() : line;

        table += `
            <tr class="${cls}">
                <td style="color:var(--text-muted);font-family:monospace;white-space:nowrap">${escapeHtml(ts)}</td>
                <td><span class="log-badge ${cls}">${status}</span></td>
                <td style="word-break:break-all">${escapeHtml(cleanLine)}</td>
            </tr>
        `;
    });

    table += '</tbody></table>';
    output.innerHTML = table;
}

function toggleLiveTail(enabled) {
    if (liveTailTimer) {
        clearInterval(liveTailTimer);
        liveTailTimer = null;
    }

    if (enabled) {
        showToast('Режим Live Tail включен (авто-опрос каждые 2 сек)', 'info', 2000);
        loadLogs();
        liveTailTimer = setInterval(() => {
            const active = document.querySelector('.tab-content.active');
            if (active && active.id === 'logs') {
                loadLogs();
            }
        }, 2000);
    } else {
        showToast('Режим Live Tail выключен', 'info', 2000);
    }
}

function downloadCurrentLog() {
    const nameEl = document.getElementById('logSelector');
    const name = nameEl ? nameEl.value : 'main-server';
    const blob = new Blob([logData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Лог "${name}" сохранен на устройство`, 'success');
}
