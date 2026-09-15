async function loadServices() {
    try {
        const res = await authFetch('/api/services');
        const services = await res.json();
        const container = document.getElementById('servicesContainer');
        if (!container) return;
        container.innerHTML = '';

        services.forEach(s => {
            const card = document.createElement('div');
            card.className = 'service-card';

            const isRunning = s.running;
            const statusClass = isRunning ? 'running' : 'stopped';
            const statusText = isRunning ? '🟢 Работает' : '🔴 Остановлена';
            const btnAction = isRunning ? 'stop' : 'start';
            const btnLabel = isRunning ? '⏹ Остановить' : '▶ Запустить';
            const btnClass = isRunning ? 'btn-stop' : 'btn-start';

            card.innerHTML = `
                <div>
                    <div class="service-top">
                        <div>
                            <h3 class="service-title">${s.icon || '⚡'} ${escapeHtml(s.label)}</h3>
                            <p class="service-desc">${escapeHtml(s.desc)}</p>
                        </div>
                        <span class="service-status-pill ${statusClass}">${statusText}</span>
                    </div>
                </div>

                <div class="service-actions-row">
                    <button class="service-btn ${btnClass}" onclick="toggleService('${s.id}', '${btnAction}', '${escapeHtml(s.label)}')">${btnLabel}</button>
                    <button class="service-btn btn-service-restart" onclick="restartService('${s.id}', '${escapeHtml(s.label)}')">🔄 Перезапуск</button>
                    <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
                        <span style="font-size:12px;color:var(--text-secondary)">Автозапуск</span>
                        <label class="toggle-switch">
                            <input type="checkbox" ${s.autostart ? 'checked' : ''} onchange="toggleAutostart('${s.id}', this.checked, '${escapeHtml(s.label)}')">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch(e) {
        showToast('Ошибка загрузки списка служб', 'error');
    }
}

async function toggleService(name, action, label) {
    const actionText = action === 'start' ? 'Запуск' : 'Остановка';
    showToast(`${actionText} службы ${label || name}...`, 'info', 2000);

    try {
        const res = await authFetch('/api/services/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            setTimeout(() => {
                loadServices();
                showToast(`Служба ${label || name} ${action === 'start' ? 'запущена' : 'остановлена'}`, 'success');
            }, 800);
        } else {
            const data = await res.json();
            showToast('Ошибка: ' + (data.error || 'не удалось переключить службу'), 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при переключении службы', 'error');
    }
}

async function restartService(name, label) {
    showToast(`Перезапуск службы ${label || name}...`, 'info', 2000);
    try {
        const res = await authFetch('/api/services/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            setTimeout(() => {
                loadServices();
                showToast(`Служба ${label || name} успешно перезапущена`, 'success');
            }, 800);
        } else {
            const data = await res.json();
            showToast('Ошибка при перезапуске: ' + (data.error || 'сбой'), 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при перезапуске службы', 'error');
    }
}

async function toggleAutostart(name, enabled, label) {
    try {
        const res = await authFetch('/api/services/autostart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, enabled })
        });
        if (res.ok) {
            showToast(`Автозапуск ${label || name}: ${enabled ? 'включен' : 'выключен'}`, 'success');
        } else {
            showToast('Ошибка настройки автозапуска', 'error');
            loadServices();
        }
    } catch(e) {
        showToast('Ошибка сети при изменении автозапуска', 'error');
    }
}
