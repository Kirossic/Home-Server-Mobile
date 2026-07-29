async function loadFiles(dirPath = '') {
    try {
        const res = await authFetch('/api/files/list?path=' + encodeURIComponent(dirPath));
        const data = await res.json();
        if (data.error) return alert(data.error);

        currentPath = data.currentPath;
        document.getElementById('pathBar').innerText = currentPath;
        updateTermPrompt();
        const container = document.getElementById('filesContainer');
        container.innerHTML = '';

        data.files.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
        data.files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item ' + (f.isDir ? 'dir' : '');
            div.innerHTML = '<span>' + (f.isDir ? '📁' : '📄') + ' ' + f.name + '</span>';
            div.onclick = () => f.isDir ? loadFiles(f.fullPath) : openFile(f.fullPath);

            const actions = document.createElement('span');
            actions.className = 'file-actions';
            if (f.isDir) {
                const zipBtn = document.createElement('span');
                zipBtn.className = 'action-btn zip-btn';
                zipBtn.title = 'Скачать как ZIP';
                zipBtn.innerHTML = '📦';
                zipBtn.onclick = (e) => { e.stopPropagation(); downloadDir(f.fullPath); };
                actions.appendChild(zipBtn);
            } else {
                const dlBtn = document.createElement('span');
                dlBtn.className = 'action-btn dl-btn';
                dlBtn.title = 'Скачать';
                dlBtn.innerHTML = '⬇';
                dlBtn.onclick = (e) => { e.stopPropagation(); downloadFile(f.fullPath); };
                actions.appendChild(dlBtn);
            }
            const delBtn = document.createElement('span');
            delBtn.className = 'action-btn del-btn';
            delBtn.title = 'Удалить';
            delBtn.innerHTML = '🗑';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteFileOrDir(f.fullPath); };
            actions.appendChild(delBtn);
            div.appendChild(actions);
            container.appendChild(div);
        });
    } catch(e) {}
}

function goBack() {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadFiles('/' + parts.join('/'));
}

async function openFile(filePath) {
    openFilePath = filePath;
    try {
        const res = await authFetch('/api/files/view?path=' + encodeURIComponent(filePath));
        const text = await res.text();
        document.getElementById('editorTitle').innerText = 'Редактирование: ' + filePath.split('/').pop();
        const ed = document.getElementById('editor');
        ed.value = text; ed.disabled = false;
        document.getElementById('saveBtn').style.display = 'block';
    } catch(e) { alert('Не удалось открыть файл'); }
}

async function saveCurrentFile() {
    const content = document.getElementById('editor').value;
    try {
        const res = await authFetch('/api/files/save?path=' + encodeURIComponent(openFilePath), { method: 'POST', body: content });
        if (res.ok) alert('Сохранено успешно!');
    } catch(e) { alert('Ошибка сети'); }
}

function downloadFile(filePath) {
    window.open('/api/files/download?path=' + encodeURIComponent(filePath), '_blank');
}

function downloadDir(dirPath) {
    window.open('/api/files/download-dir?path=' + encodeURIComponent(dirPath), '_blank');
}

async function deleteFileOrDir(targetPath) {
    const name = targetPath.split('/').pop();
    if (!confirm('Удалить "' + name + '"? Это действие необратимо.')) return;
    try {
        const res = await authFetch('/api/files/delete?path=' + encodeURIComponent(targetPath), { method: 'DELETE' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка при удалении'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function uploadFile() {
    const input = document.getElementById('fileInput');
    const file = input.files[0];
    if (!file) return;
    try {
        const res = await authFetch('/api/files/upload?dir=' + encodeURIComponent(currentPath) + '&name=' + encodeURIComponent(file.name), { method: 'POST', body: file });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка загрузки'); }
    } catch(e) { alert('Ошибка сети'); }
    input.value = '';
}

async function createFolder() {
    const name = prompt('Введите имя новой папки:');
    if (!name || !name.trim()) return;
    let folderPath = currentPath === '/' ? '/' + name.trim() : currentPath + '/' + name.trim();
    if (currentPath.endsWith('/')) folderPath = currentPath + name.trim();
    try {
        const res = await authFetch('/api/files/mkdir?path=' + encodeURIComponent(folderPath), { method: 'POST' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка создания папки'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function createFile() {
    const name = prompt('Введите имя файла (с расширением):');
    if (!name || !name.trim()) return;
    let filePath = currentPath === '/' ? '/' + name.trim() : currentPath + '/' + name.trim();
    if (currentPath.endsWith('/')) filePath = currentPath + name.trim();
    try {
        const res = await authFetch('/api/files/create?path=' + encodeURIComponent(filePath), { method: 'POST' });
        if (res.ok) { loadFiles(currentPath); }
        else { alert('Ошибка создания файла'); }
    } catch(e) { alert('Ошибка сети'); }
}

async function searchFiles() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) return;
    const container = document.getElementById('filesContainer');
    container.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">Поиск...</div>';
    try {
        const res = await authFetch('/api/files/search?query=' + encodeURIComponent(query) + '&dir=' + encodeURIComponent(currentPath || '/data/data/com.termux/files/home'));
        const files = await res.json();
        container.innerHTML = '';
        if (files.length === 0) {
            container.innerHTML = '<div style="padding:10px;color:var(--text-secondary)">Ничего не найдено</div>';
            return;
        }
        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = '<span>📄 ' + f.name + '</span><span style="font-size:11px;color:var(--text-secondary)">...</span>';
            div.onclick = () => openFile(f.fullPath);
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<div style="padding:10px;color:var(--danger)">Ошибка поиска</div>';
    }
}
