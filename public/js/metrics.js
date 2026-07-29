const METRICS_COLUMNS = {
    ram: ['ts', 'used_gb', 'total_gb', 'free_gb', 'load_1m', 'load_5m', 'load_15m'],
    battery: ['ts', 'percentage', 'status', 'temperature', 'voltage', 'health', 'cycles'],
    storage: ['ts', 'mount', 'total_gb', 'used_gb', 'avail_gb']
};

const METRICS_LABELS = {
    ram: ['Время', 'Used (GB)', 'Total (GB)', 'Free (GB)', 'Load 1m', 'Load 5m', 'Load 15m'],
    battery: ['Время', 'Заряд %', 'Статус', 'Темп.', 'mV', 'Здоровье', 'Циклы'],
    storage: ['Время', 'Точка монт.', 'Total (GB)', 'Used (GB)', 'Avail (GB)']
};

function formatMetricsValue(type, col, val) {
    if (val === null || val === undefined) return '-';
    if (col === 'voltage') return (val / 1000).toFixed(3) + 'V';
    if (col === 'temperature') return val + '°C';
    if (['used_gb', 'total_gb', 'free_gb', 'avail_gb'].includes(col)) return parseFloat(val).toFixed(2);
    return val;
}

async function loadMetrics() {
    const type = document.getElementById('metricsType').value;
    const limit = document.getElementById('metricsLimit').value;
    const thead = document.getElementById('metricsTableHead');
    const tbody = document.getElementById('metricsTableBody');

    thead.innerHTML = '<tr>' + METRICS_LABELS[type].map(h => '<th>' + h + '</th>').join('') + '</tr>';
    tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--text-secondary)">Загрузка...</td></tr>';

    try {
        const res = await authFetch('/api/metrics/' + type + '?limit=' + limit);
        const data = await res.json();
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--text-secondary)">Нет данных</td></tr>';
            return;
        }

        const cols = METRICS_COLUMNS[type];
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = cols.map(c => '<td>' + formatMetricsValue(type, c, row[c]) + '</td>').join('');
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--danger)">Ошибка загрузки</td></tr>';
    }
}

async function loadEvents() {
    const type = document.getElementById('eventsType').value;
    const tbody = document.getElementById('eventsTableBody');

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary)">Загрузка...</td></tr>';

    try {
        const url = '/api/events?limit=200' + (type ? '&type=' + type : '');
        const res = await authFetch(url);
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data.rows || data.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary)">Нет событий</td></tr>';
            return;
        }

        data.rows.forEach(row => {
            const tr = document.createElement('tr');
            const levelClass = row.level === 'error' ? 'log-error' : (row.level === 'warn' ? 'log-warn' : '');
            let detail = row.detail || '';
            try { const parsed = JSON.parse(detail); detail = JSON.stringify(parsed); } catch(e) {}
            tr.innerHTML = '<td>' + (row.ts || '') + '</td>' +
                '<td><span class="log-badge">' + escapeHtml(row.type) + '</span></td>' +
                '<td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(detail) + '</td>' +
                '<td>' + escapeHtml(row.level) + '</td>';
            if (levelClass) tr.className = levelClass;
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--danger)">Ошибка загрузки</td></tr>';
    }
}
