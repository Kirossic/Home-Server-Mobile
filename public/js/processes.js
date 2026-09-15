let allProcesses = [];
let sortCol = 'cpu';
let sortAsc = false;
let procRefreshTimer = null;

function updateProcStats(processes) {
    const total = processes.length;
    const cmdCounts = {};
    processes.forEach(p => {
        const cmd = (p.cmd || '').split(' ')[0];
        cmdCounts[cmd] = (cmdCounts[cmd] || 0) + 1;
    });
    const unique = Object.keys(cmdCounts).length;
    const duplicates = Object.values(cmdCounts).filter(c => c > 1).length;
    const statsEl = document.getElementById('procStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div>Всего процессов: <strong>${total}</strong> | Уникальных: <strong>${unique}</strong> | Повторов: <strong>${duplicates}</strong></div>
            <div style="font-size:11px;color:var(--text-muted)">Сортировка: <b style="color:var(--accent)">${sortCol.toUpperCase()}</b> (${sortAsc ? 'возр.' : 'убыв.'})</div>
        `;
    }
}

function sortProcesses(col) {
    if (sortCol === col) {
        sortAsc = !sortAsc;
    } else {
        sortCol = col;
        sortAsc = (col === 'cmd' || col === 'user'); // strings default ascending, numbers descending
    }

    updateSortIndicators();
    applyProcessSortAndFilter();
}

function updateSortIndicators() {
    ['pid', 'user', 'cpu', 'mem', 'cmd'].forEach(c => {
        const el = document.getElementById(`sort-${c}`);
        if (el) {
            if (c === sortCol) {
                el.textContent = sortAsc ? ' ▲' : ' ▼';
            } else {
                el.textContent = '';
            }
        }
    });
}

function applyProcessSortAndFilter() {
    const query = document.getElementById('procSearch')?.value.toLowerCase().trim() || '';
    let list = allProcesses.slice();

    if (query) {
        list = list.filter(p =>
            String(p.pid).includes(query) ||
            (p.user && p.user.toLowerCase().includes(query)) ||
            (p.cmd && p.cmd.toLowerCase().includes(query))
        );
    }

    list.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];

        if (sortCol === 'pid' || sortCol === 'cpu' || sortCol === 'mem') {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
            return sortAsc ? valA - valB : valB - valA;
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
            return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
    });

    updateProcStats(list);
    renderProcesses(list);
}

function renderProcesses(processes) {
    const tbody = document.getElementById('processTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    processes.slice(0, 200).forEach(p => {
        const tr = document.createElement('tr');
        const cpuNum = parseFloat(p.cpu) || 0;
        const memNum = parseFloat(p.mem) || 0;

        if (cpuNum >= 15) tr.classList.add('high-cpu');
        else if (memNum >= 10) tr.classList.add('high-mem');

        const cmdEscaped = escapeHtml(p.cmd || '');
        tr.innerHTML = `
            <td style="font-weight:600;color:var(--accent)">${p.pid}</td>
            <td style="color:var(--text-secondary)">${escapeHtml(p.user || '-')}</td>
            <td style="font-weight:${cpuNum > 5 ? 'bold' : 'normal'}">${p.cpu}%</td>
            <td style="font-weight:${memNum > 5 ? 'bold' : 'normal'}">${p.mem}%</td>
            <td class="proc-cmd" title="${cmdEscaped}">${cmdEscaped}</td>
            <td><button class="btn-kill" onclick="killProcess('${p.pid}')">Kill</button></td>
        `;
        tbody.appendChild(tr);
    });

    if (processes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Ничего не найдено</td></tr>';
    }
}

function filterProcesses() {
    applyProcessSortAndFilter();
}

async function loadProcesses() {
    const tbody = document.getElementById('processTbody');
    if (allProcesses.length === 0 && tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Загрузка списка процессов...</td></tr>';
    }

    try {
        const res = await authFetch('/api/processes');
        allProcesses = await res.json();
        updateSortIndicators();
        applyProcessSortAndFilter();
    } catch(e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px">Ошибка загрузки процессов</td></tr>';
    }
}

function toggleProcAutoRefresh(enabled) {
    if (procRefreshTimer) {
        clearInterval(procRefreshTimer);
        procRefreshTimer = null;
    }
    if (enabled) {
        procRefreshTimer = setInterval(() => {
            const active = document.querySelector('.tab-content.active');
            if (active && active.id === 'processes') {
                loadProcesses();
            }
        }, 3000);
        showToast('Автообновление процессов включено (каждые 3 сек)', 'info', 2000);
    } else {
        showToast('Автообновление процессов отключено', 'info', 2000);
    }
}

async function killProcess(pid) {
    const confirmed = await confirmModal({
        title: 'Завершение процесса',
        message: `Принудительно отправить сигнал SIGKILL процессу PID ${pid}?`,
        confirmText: 'Завершить',
        danger: true
    });
    if (!confirmed) return;

    try {
        const res = await authFetch('/api/processes/kill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid })
        });
        if (res.ok) {
            showToast(`Процесс PID ${pid} завершен`, 'success');
            loadProcesses();
        } else {
            showToast('Не удалось завершить процесс', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при завершении процесса', 'error');
    }
}
