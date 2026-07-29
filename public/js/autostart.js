async function loadBashrc() {
    try {
        const res = await authFetch('/api/autostart/get');
        const text = await res.text();
        document.getElementById('bashrcEditor').value = text;
    } catch(e) { alert('Ошибка при загрузке .bashrc'); }
}

async function saveBashrc() {
    const content = document.getElementById('bashrcEditor').value;
    try {
        const res = await authFetch('/api/autostart/save', { method: 'POST', body: content });
        if (res.ok) alert('Конфигурация автозапуска обновлена!');
    } catch(e) { alert('Ошибка сохранения .bashrc'); }
}
