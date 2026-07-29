let logRawMode = true;
let logData = '';

async function loadLogs() {
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
}

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
        const short = line.length > 120 ? line.slice(0, 120) + '...' : line;

        table += '<tr class="' + cls + '"><td>' + ts[1] + '</td><td><span class="log-badge ' + cls + '">' + status + '</span></td><td>' + escapeHtml(short) + '</td></tr>';
    });
    table += '</tbody></table>';
    output.innerHTML = table;
}
