async function loadBashrc() {
    try {
        const res = await authFetch('/api/autostart/get');
        const text = await res.text();
        const ed = document.getElementById('bashrcEditor');
        if (ed) ed.value = text;
    } catch(e) {
        showToast('Ошибка при загрузке .bashrc', 'error');
    }
}

async function saveBashrc() {
    const ed = document.getElementById('bashrcEditor');
    if (!ed) return;
    const content = ed.value;

    try {
        const res = await authFetch('/api/autostart/save', { method: 'POST', body: content });
        if (res.ok) {
            showToast('Конфигурация автозапуска успешно сохранена!', 'success');
        } else {
            showToast('Ошибка сохранения конфигурации автозапуска', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при сохранении .bashrc', 'error');
    }
}
