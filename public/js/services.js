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
