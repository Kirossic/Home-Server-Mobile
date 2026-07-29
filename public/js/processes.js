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
