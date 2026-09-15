const METRICS_COLUMNS = {
    ram: ['ts', 'used_gb', 'total_gb', 'free_gb', 'load_1m', 'load_5m', 'load_15m'],
    battery: ['ts', 'percentage', 'status', 'temperature', 'voltage', 'health', 'cycles'],
    storage: ['ts', 'mount', 'total_gb', 'used_gb', 'avail_gb']
};

const METRICS_LABELS = {
    ram: ['Время', 'Used (GB)', 'Total (GB)', 'Free (GB)', 'Load 1m', 'Load 5m', 'Load 15m'],
    battery: ['Время', 'Заряд %', 'Статус', 'Темп.', 'Напряжение', 'Здоровье', 'Циклы'],
    storage: ['Время', 'Точка монт.', 'Total (GB)', 'Used (GB)', 'Avail (GB)']
};

let currentArchiveFile = '';

function formatMetricsValue(type, col, val) {
    if (val === null || val === undefined) return '-';
    if (col === 'voltage') return (val / 1000).toFixed(3) + ' В';
    if (col === 'temperature') return val + '°C';
    if (['used_gb', 'total_gb', 'free_gb', 'avail_gb'].includes(col)) return parseFloat(val).toFixed(2);
    return val;
}

async function loadMetrics() {
    const type = document.getElementById('metricsType')?.value || 'ram';
    const limit = document.getElementById('metricsLimit')?.value || '200';
    const thead = document.getElementById('metricsTableHead');
    const tbody = document.getElementById('metricsTableBody');
    if (!thead || !tbody) return;

    thead.innerHTML = '<tr>' + METRICS_LABELS[type].map(h => '<th>' + h + '</th>').join('') + '</tr>';
    tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--text-secondary);padding:16px">Загрузка данных...</td></tr>';

    try {
        let url = '/api/metrics/' + type + '?limit=' + limit;
        if (currentArchiveFile) {
            url = '/api/archives/' + encodeURIComponent(currentArchiveFile) + '/query?table=metrics_' + type + '&limit=' + limit;
        }

        const res = await authFetch(url);
        const resData = await res.json();
        const data = currentArchiveFile ? (resData.rows || []).slice().reverse() : resData;
        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--text-muted);padding:20px">Нет сохраненных метрик</td></tr>';
            return;
        }

        const cols = METRICS_COLUMNS[type];
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = cols.map(c => '<td>' + formatMetricsValue(type, c, row[c]) + '</td>').join('');
            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="' + METRICS_LABELS[type].length + '" style="text-align:center;color:var(--danger);padding:16px">Ошибка загрузки метрик</td></tr>';
    }
}

async function loadDbStats() {
    const label = document.getElementById('dbSizeLabel');
    if (!label) return;
    try {
        const res = await authFetch('/api/events/db-stats');
        const data = await res.json();
        label.textContent = data.size || 'Неизвестно';
    } catch(e) {
        label.textContent = 'Ошибка';
    }
}

async function loadArchiveList() {
    const sel = document.getElementById('archiveSelector');
    if (!sel) return;
    try {
        const res = await authFetch('/api/archives');
        const archives = await res.json();
        const prev = sel.value;
        sel.innerHTML = '<option value="">🔥 Активная база (текущий месяц)</option>';
        archives.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.filename;
            opt.textContent = `📦 ${a.month} (${a.sizeFormatted})`;
            sel.appendChild(opt);
        });
        if (prev && archives.some(a => a.filename === prev)) {
            sel.value = prev;
        }
    } catch (e) {}
}

function onArchiveSelectionChange() {
    const sel = document.getElementById('archiveSelector');
    currentArchiveFile = sel ? sel.value : '';

    const downloadBtn = document.getElementById('archiveDownloadBtn');
    const restoreBtn = document.getElementById('archiveRestoreBtn');

    if (currentArchiveFile) {
        if (downloadBtn) downloadBtn.style.display = 'inline-block';
        if (restoreBtn) restoreBtn.style.display = 'inline-block';
    } else {
        if (downloadBtn) downloadBtn.style.display = 'none';
        if (restoreBtn) restoreBtn.style.display = 'none';
    }

    loadEvents();
    loadMetrics();
}

function downloadSelectedArchive() {
    if (!currentArchiveFile) return;
    window.open('/api/archives/' + encodeURIComponent(currentArchiveFile) + '/download', '_blank');
}

async function restoreSelectedArchive() {
    if (!currentArchiveFile) return;
    const confirmed = await confirmModal({
        title: 'Восстановление архива',
        message: `Восстановить исторические данные из архива "${currentArchiveFile}" в текущую активную базу?`,
        confirmText: 'Восстановить',
        danger: false
    });
    if (!confirmed) return;

    const status = document.getElementById('vacuumStatus');
    if (status) status.textContent = '⏳ Восстановление...';
    try {
        const res = await authFetch('/api/archives/' + encodeURIComponent(currentArchiveFile) + '/restore', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            if (status) status.textContent = '✅ Восстановлено!';
            showToast('Архив успешно восстановлен в базу!', 'success');
            const sel = document.getElementById('archiveSelector');
            if (sel) sel.value = '';
            onArchiveSelectionChange();
            await loadDbStats();
        } else {
            if (status) status.textContent = 'Ошибка восстановления';
            showToast('Ошибка восстановления архива', 'error');
        }
    } catch(e) {
        if (status) status.textContent = '❌ Ошибка';
        showToast('Сбой сети при восстановлении архива', 'error');
    }
}

async function triggerArchiveCreation() {
    const status = document.getElementById('vacuumStatus');
    if (status) status.textContent = '⏳ Создание архива...';
    try {
        const res = await authFetch('/api/archives/create', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.archive) {
            if (status) status.textContent = `✅ Создан ${data.archive.filename} (${data.archive.sizeFormatted})`;
            showToast(`Создан архив: ${data.archive.filename}`, 'success');
        } else {
            const msg = data.message || 'Нет прошлых месяцев для архивации';
            if (status) status.textContent = msg;
            showToast(msg, 'info');
        }
        await loadArchiveList();
        await loadDbStats();
        await loadEvents();
        await loadMetrics();
    } catch(e) {
        if (status) status.textContent = '❌ Ошибка';
        showToast('Ошибка при архивации', 'error');
    }
}

async function triggerMaintenance() {
    const status = document.getElementById('vacuumStatus');
    if (status) status.textContent = '⏳ VACUUM...';
    try {
        const res = await authFetch('/api/events/maintenance', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.stats) {
            const resultMsg = `Сжато: ${data.stats.startSize} → ${data.stats.endSize}`;
            if (status) status.textContent = `✅ ${resultMsg}`;
            showToast(`База оптимизирована! ${resultMsg}`, 'success');
        } else {
            if (status) status.textContent = 'Готово';
            showToast('Оптимизация базы завершена', 'success');
        }
        await loadArchiveList();
        await loadDbStats();
        await loadEvents();
        await loadMetrics();
    } catch(e) {
        if (status) status.textContent = '❌ Ошибка оптимизации';
        showToast('Ошибка при оптимизации базы', 'error');
    }
}

async function loadEvents() {
    loadDbStats();
    loadArchiveList();

    const source = document.getElementById('eventsSource')?.value || '';
    const level = document.getElementById('eventsLevel')?.value || '';
    const query = document.getElementById('eventsQuery')?.value || '';
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:16px">Загрузка журнала...</td></tr>';

    try {
        let url = '/api/events?limit=200';
        if (currentArchiveFile) {
            url = '/api/archives/' + encodeURIComponent(currentArchiveFile) + '/query?table=events&limit=200';
        }
        if (source) url += '&source=' + encodeURIComponent(source);
        if (level) url += '&level=' + encodeURIComponent(level);
        if (query) url += '&query=' + encodeURIComponent(query);

        const res = await authFetch(url);
        const data = await res.json();
        tbody.innerHTML = '';

        if (!data.rows || data.rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Нет событий' + (currentArchiveFile ? ' в выбранном архиве' : '') + '</td></tr>';
            return;
        }

        data.rows.forEach(row => {
            const tr = document.createElement('tr');
            let levelClass = 'log-info';
            if (row.level === 'error') levelClass = 'log-error';
            else if (row.level === 'warn') levelClass = 'log-warn';
            else if (row.source === 'security') levelClass = 'log-badge.log-watch';

            let detail = row.detail || '';
            try { const parsed = JSON.parse(detail); detail = JSON.stringify(parsed); } catch(e) {}

            const sourceBadge = `<span class="log-badge" style="background:var(--bg-hover);color:var(--text-secondary)">${escapeHtml(row.source || 'system')}</span>`;
            const levelBadge = `<span class="log-badge ${levelClass}">${escapeHtml((row.level || 'info').toUpperCase())}</span>`;

            tr.innerHTML = `
                <td style="color:var(--text-muted);white-space:nowrap">${escapeHtml(row.ts || '')}</td>
                <td>${sourceBadge}</td>
                <td style="font-weight:600">${escapeHtml(row.type)}</td>
                <td style="font-size:11px;max-width:380px;overflow:hidden;text-overflow:ellipsis;word-break:break-all">${escapeHtml(detail)}</td>
                <td>${levelBadge}</td>
            `;
            if (row.level === 'error') tr.className = 'log-error';
            else if (row.level === 'warn') tr.className = 'log-warn';

            tbody.appendChild(tr);
        });
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--danger);padding:16px">Ошибка загрузки событий</td></tr>';
    }
}
