let linksData = [];

async function loadLinks() {
    try {
        const res = await authFetch('/api/links');
        linksData = await res.json();
        const container = document.getElementById('linksContainer');
        if (!container) return;
        container.innerHTML = '';

        if (linksData.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:30px">Нет добавленных ссылок. Нажмите «+ Добавить ссылку» выше.</p>';
            return;
        }

        linksData.forEach(link => {
            const card = document.createElement('div');
            card.className = 'link-card';
            card.dataset.linkId = link.id;
            card.innerHTML = `
                <div>
                    <div class="link-card-header">
                        <span class="link-icon">${link.icon || '🔗'}</span>
                        <div style="flex:1">
                            <h3><span class="link-name">${escapeHtml(link.name)}</span> <span class="link-dot"></span></h3>
                            <div style="font-size:11px;color:var(--text-muted);font-family:monospace;word-break:break-all">${escapeHtml(link.url)}</div>
                        </div>
                    </div>
                    <p>${escapeHtml(link.desc || '')}</p>
                </div>
                <div class="link-card-actions">
                    <a href="${link.url}" target="_blank" class="btn-link-open">Открыть</a>
                    <button class="btn-link-edit" onclick="editLink(${link.id})" title="Редактировать">✏</button>
                    <button class="btn-link-del" onclick="deleteLink(${link.id})" title="Удалить">🗑</button>
                </div>
            `;
            container.appendChild(card);
        });

        updateLinkStatus();
    } catch(e) {
        showToast('Ошибка загрузки сервисов', 'error');
    }
}

async function updateLinkStatus() {
    try {
        const res = await authFetch('/api/links/status');
        const statuses = await res.json();
        document.querySelectorAll('#linksContainer .link-card').forEach(card => {
            const id = parseInt(card.dataset.linkId);
            const st = statuses.find(s => s.id === id);
            const dot = card.querySelector('.link-dot');
            if (dot) {
                dot.innerHTML = st ? (st.online ? '<span style="color:#04d361" title="Онлайн">🟢</span>' : '<span style="color:#e53e3e" title="Офлайн">🔴</span>') : '';
            }
        });
    } catch(e) {}
}

let linkStatusInterval = null;

function startLinkStatusRefresh() {
    if (linkStatusInterval) clearInterval(linkStatusInterval);
    linkStatusInterval = setInterval(updateLinkStatus, 30000);
}

function showAddLinkForm() {
    document.getElementById('linkFormTitle').innerText = 'Добавить ссылку';
    document.getElementById('linkEditId').value = '';
    document.getElementById('linkName').value = '';
    document.getElementById('linkUrl').value = '';
    document.getElementById('linkIcon').value = '';
    document.getElementById('linkDesc').value = '';
    document.getElementById('linkFormOverlay').style.display = 'flex';
}

function hideLinkForm() {
    document.getElementById('linkFormOverlay').style.display = 'none';
}

function editLink(id) {
    const link = linksData.find(l => l.id === id);
    if (!link) return;
    document.getElementById('linkFormTitle').innerText = 'Редактировать ссылку';
    document.getElementById('linkEditId').value = id;
    document.getElementById('linkName').value = link.name;
    document.getElementById('linkUrl').value = link.url;
    document.getElementById('linkIcon').value = link.icon || '';
    document.getElementById('linkDesc').value = link.desc || '';
    document.getElementById('linkFormOverlay').style.display = 'flex';
}

async function saveLink() {
    const id = document.getElementById('linkEditId').value;
    const name = document.getElementById('linkName').value.trim();
    const url = document.getElementById('linkUrl').value.trim();
    const icon = document.getElementById('linkIcon').value.trim();
    const desc = document.getElementById('linkDesc').value.trim();
    if (!name || !url) {
        showToast('Название и URL обязательны для заполнения', 'warn');
        return;
    }

    if (id) {
        const idx = linksData.findIndex(l => l.id === parseInt(id));
        if (idx >= 0) linksData[idx] = { ...linksData[idx], name, url, icon, desc };
    } else {
        const newId = linksData.length > 0 ? Math.max(...linksData.map(l => l.id)) + 1 : 1;
        linksData.push({ id: newId, name, url, icon, desc });
    }

    try {
        const res = await authFetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(linksData)
        });
        if (res.ok) {
            hideLinkForm();
            loadLinks();
            showToast('Ссылка сохранена', 'success');
        } else {
            showToast('Ошибка при сохранении ссылки', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при сохранении', 'error');
    }
}

async function deleteLink(id) {
    const target = linksData.find(l => l.id === id);
    const confirmed = await confirmModal({
        title: 'Удаление ссылки',
        message: `Удалить закладку "${target ? target.name : ''}"?`,
        confirmText: 'Удалить',
        danger: true
    });
    if (!confirmed) return;

    linksData = linksData.filter(l => l.id !== id);
    try {
        const res = await authFetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(linksData)
        });
        if (res.ok) {
            loadLinks();
            showToast('Ссылка удалена', 'success');
        } else {
            showToast('Ошибка при удалении ссылки', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при удалении', 'error');
    }
}
