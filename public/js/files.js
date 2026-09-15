let openFilePath = '';
let isFileModified = false;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];

function getFileIcon(filename, isDir) {
    if (isDir) return '📁';
    const ext = '.' + filename.split('.').pop().toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) return '🖼️';
    if (['.js', '.ts', '.mjs', '.json'].includes(ext)) return '⚡';
    if (['.html', '.css'].includes(ext)) return '🌐';
    if (['.sh', '.bash', '.zsh'].includes(ext)) return '🐚';
    if (['.py'].includes(ext)) return '🐍';
    if (['.md', '.txt', '.log'].includes(ext)) return '📄';
    if (['.zip', '.tar', '.gz', '.db', '.sqlite', '.sqlite3'].includes(ext)) return '📦';
    return '📄';
}

function renderBreadcrumbs(pathStr) {
    const bar = document.getElementById('breadcrumbsBar');
    if (!bar) return;
    bar.innerHTML = '';

    const termuxHome = '/data/data/com.termux/files/home';
    let displayPath = pathStr || '/';

    // Root crumb
    const rootCrumb = document.createElement('span');
    rootCrumb.className = 'crumb';
    rootCrumb.textContent = 'root';
    rootCrumb.onclick = () => loadFiles('/');
    bar.appendChild(rootCrumb);

    if (displayPath.startsWith(termuxHome)) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = ' / ';
        bar.appendChild(sep);

        const homeCrumb = document.createElement('span');
        homeCrumb.className = 'crumb';
        homeCrumb.textContent = '~';
        homeCrumb.onclick = () => loadFiles(termuxHome);
        bar.appendChild(homeCrumb);

        const sub = displayPath.slice(termuxHome.length);
        const parts = sub.split('/').filter(Boolean);
        let accumulated = termuxHome;

        parts.forEach((p, idx) => {
            accumulated += '/' + p;
            const targetPath = accumulated;

            const partSep = document.createElement('span');
            partSep.className = 'crumb-sep';
            partSep.textContent = ' / ';
            bar.appendChild(partSep);

            const crumb = document.createElement('span');
            crumb.className = 'crumb' + (idx === parts.length - 1 ? ' active-crumb' : '');
            crumb.textContent = p;
            if (idx !== parts.length - 1) {
                crumb.onclick = () => loadFiles(targetPath);
            }
            bar.appendChild(crumb);
        });
    } else {
        const parts = displayPath.split('/').filter(Boolean);
        let accumulated = '';
        parts.forEach((p, idx) => {
            accumulated += '/' + p;
            const targetPath = accumulated;

            const sep = document.createElement('span');
            sep.className = 'crumb-sep';
            sep.textContent = ' / ';
            bar.appendChild(sep);

            const crumb = document.createElement('span');
            crumb.className = 'crumb' + (idx === parts.length - 1 ? ' active-crumb' : '');
            crumb.textContent = p;
            if (idx !== parts.length - 1) {
                crumb.onclick = () => loadFiles(targetPath);
            }
            bar.appendChild(crumb);
        });
    }
}

async function loadFiles(dirPath = '') {
    try {
        const res = await authFetch('/api/files/list?path=' + encodeURIComponent(dirPath));
        const data = await res.json();
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        currentPath = data.currentPath;
        renderBreadcrumbs(currentPath);
        updateTermPrompt();

        const container = document.getElementById('filesContainer');
        const badge = document.getElementById('fileCountBadge');
        if (!container) return;
        container.innerHTML = '';

        if (badge) {
            const dirCount = data.files.filter(f => f.isDir).length;
            const fileCount = data.files.length - dirCount;
            badge.textContent = `${dirCount} папок, ${fileCount} файлов`;
        }

        data.files.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));

        data.files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item ' + (f.isDir ? 'dir' : '');

            const ext = '.' + f.name.split('.').pop().toLowerCase();
            const isImage = !f.isDir && IMAGE_EXTENSIONS.includes(ext);

            const left = document.createElement('div');
            left.className = 'file-left';
            left.innerHTML = `
                <span class="file-icon">${getFileIcon(f.name, f.isDir)}</span>
                <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
            `;
            div.appendChild(left);

            div.onclick = () => {
                if (f.isDir) {
                    loadFiles(f.fullPath);
                } else if (isImage) {
                    openImagePreview(f.fullPath, f.name);
                } else {
                    openFile(f.fullPath);
                }
            };

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
                if (isImage) {
                    const viewBtn = document.createElement('span');
                    viewBtn.className = 'action-btn preview-btn';
                    viewBtn.title = 'Просмотр';
                    viewBtn.innerHTML = '👁';
                    viewBtn.onclick = (e) => { e.stopPropagation(); openImagePreview(f.fullPath, f.name); };
                    actions.appendChild(viewBtn);
                }

                const dlBtn = document.createElement('span');
                dlBtn.className = 'action-btn dl-btn';
                dlBtn.title = 'Скачать файл';
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

        if (data.files.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Папка пуста</div>';
        }
    } catch(e) {
        showToast('Ошибка загрузки файлов', 'error');
    }
}

function goBack() {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    loadFiles('/' + parts.join('/'));
}

async function openFile(filePath) {
    if (isFileModified) {
        const leave = await confirmModal({
            title: 'Несохраненные изменения',
            message: 'В текущем файле есть несохраненные изменения. Открыть другой файл без сохранения?',
            confirmText: 'Открыть',
            danger: false
        });
        if (!leave) return;
    }

    openFilePath = filePath;
    try {
        const res = await authFetch('/api/files/view?path=' + encodeURIComponent(filePath));
        const text = await res.text();
        const titleEl = document.getElementById('editorTitle');
        const fileName = filePath.split('/').pop();

        if (titleEl) {
            titleEl.innerHTML = `<span>${escapeHtml(fileName)}</span><span id="unsavedDot" class="unsaved-dot" style="display:none" title="Несохраненные изменения"></span>`;
        }

        const ed = document.getElementById('editor');
        ed.value = text;
        ed.disabled = false;
        isFileModified = false;

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) saveBtn.style.display = 'inline-flex';

        const fsBtn = document.getElementById('editorFullscreenBtn');
        if (fsBtn) fsBtn.style.display = 'inline-flex';

        initEditorListeners();
    } catch(e) {
        showToast('Не удалось открыть файл', 'error');
    }
}

function initEditorListeners() {
    const ed = document.getElementById('editor');
    if (!ed || ed.dataset.bound) return;
    ed.dataset.bound = 'true';

    ed.addEventListener('input', () => {
        isFileModified = true;
        const dot = document.getElementById('unsavedDot');
        if (dot) dot.style.display = 'inline-block';
    });

    ed.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile();
        }
    });
}

async function saveCurrentFile() {
    if (!openFilePath) return;
    const content = document.getElementById('editor').value;
    try {
        const res = await authFetch('/api/files/save?path=' + encodeURIComponent(openFilePath), {
            method: 'POST',
            body: content
        });
        if (res.ok) {
            isFileModified = false;
            const dot = document.getElementById('unsavedDot');
            if (dot) dot.style.display = 'none';
            showToast('Файл успешно сохранен!', 'success');
        } else {
            showToast('Ошибка при сохранении файла', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при сохранении', 'error');
    }
}

function toggleEditorFullscreen() {
    const zone = document.getElementById('editorZone');
    const btn = document.getElementById('editorFullscreenBtn');
    if (!zone) return;
    zone.classList.toggle('fullscreen');
    if (btn) btn.textContent = zone.classList.contains('fullscreen') ? '✕ Свернуть' : '⛶';
}

function openImagePreview(filePath, fileName) {
    const overlay = document.getElementById('imagePreviewOverlay');
    const img = document.getElementById('imagePreviewImg');
    const title = document.getElementById('imagePreviewTitle');

    if (title) title.textContent = fileName;
    if (img) img.src = '/api/files/download?path=' + encodeURIComponent(filePath);
    if (overlay) overlay.style.display = 'flex';
}

function closeImagePreview() {
    const overlay = document.getElementById('imagePreviewOverlay');
    const img = document.getElementById('imagePreviewImg');
    if (img) img.src = '';
    if (overlay) overlay.style.display = 'none';
}

function downloadFile(filePath) {
    window.open('/api/files/download?path=' + encodeURIComponent(filePath), '_blank');
}

function downloadDir(dirPath) {
    window.open('/api/files/download-dir?path=' + encodeURIComponent(dirPath), '_blank');
}

async function deleteFileOrDir(targetPath) {
    const name = targetPath.split('/').pop();
    const confirmed = await confirmModal({
        title: 'Удаление объекта',
        message: `Удалить "${name}"? Это действие необратимо.`,
        confirmText: 'Удалить навсегда',
        danger: true
    });
    if (!confirmed) return;

    try {
        const res = await authFetch('/api/files/delete?path=' + encodeURIComponent(targetPath), { method: 'DELETE' });
        if (res.ok) {
            showToast(`Удалено: ${name}`, 'success');
            loadFiles(currentPath);
            if (openFilePath === targetPath) {
                const ed = document.getElementById('editor');
                if (ed) { ed.value = ''; ed.disabled = true; }
                const title = document.getElementById('editorTitle');
                if (title) title.textContent = 'Выберите файл для редактирования';
                const saveBtn = document.getElementById('saveBtn');
                if (saveBtn) saveBtn.style.display = 'none';
                openFilePath = '';
                isFileModified = false;
            }
        } else {
            showToast('Ошибка при удалении', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при удалении', 'error');
    }
}

async function uploadFile() {
    const input = document.getElementById('fileInput');
    const file = input.files[0];
    if (!file) return;

    showToast(`Загрузка "${file.name}"...`, 'info');
    try {
        const res = await authFetch('/api/files/upload?dir=' + encodeURIComponent(currentPath) + '&name=' + encodeURIComponent(file.name), {
            method: 'POST',
            body: file
        });
        if (res.ok) {
            showToast(`Файл "${file.name}" успешно загружен!`, 'success');
            loadFiles(currentPath);
        } else {
            showToast('Ошибка загрузки файла на сервер', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при загрузке', 'error');
    }
    input.value = '';
}

async function createFolder() {
    const name = await promptModal({
        title: 'Создание папки',
        message: `Создать новую папку в: ${currentPath || '~'}`,
        placeholder: 'Имя новой папки'
    });
    if (!name) return;

    let folderPath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
    if (currentPath.endsWith('/')) folderPath = currentPath + name;

    try {
        const res = await authFetch('/api/files/mkdir?path=' + encodeURIComponent(folderPath), { method: 'POST' });
        if (res.ok) {
            showToast(`Папка "${name}" создана`, 'success');
            loadFiles(currentPath);
        } else {
            showToast('Ошибка создания папки', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при создании папки', 'error');
    }
}

async function createFile() {
    const name = await promptModal({
        title: 'Создание файла',
        message: `Создать новый файл в: ${currentPath || '~'}`,
        placeholder: 'filename.ext'
    });
    if (!name) return;

    let filePath = currentPath === '/' ? '/' + name : currentPath + '/' + name;
    if (currentPath.endsWith('/')) filePath = currentPath + name;

    try {
        const res = await authFetch('/api/files/create?path=' + encodeURIComponent(filePath), { method: 'POST' });
        if (res.ok) {
            showToast(`Файл "${name}" создан`, 'success');
            loadFiles(currentPath);
            openFile(filePath);
        } else {
            showToast('Ошибка создания файла', 'error');
        }
    } catch(e) {
        showToast('Ошибка сети при создании файла', 'error');
    }
}

async function searchFiles() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) {
        loadFiles(currentPath);
        return;
    }

    const container = document.getElementById('filesContainer');
    container.innerHTML = '<div style="padding:16px;color:var(--text-secondary);text-align:center">🔍 Поиск...</div>';

    try {
        const res = await authFetch('/api/files/search?query=' + encodeURIComponent(query) + '&dir=' + encodeURIComponent(currentPath || '/data/data/com.termux/files/home'));
        const files = await res.json();
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center">Ничего не найдено</div>';
            return;
        }

        files.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-left">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${escapeHtml(f.name)}</span>
                </div>
                <span style="font-size:11px;color:var(--text-muted);font-family:monospace">${escapeHtml(f.fullPath.slice(-30))}</span>
            `;
            div.onclick = () => openFile(f.fullPath);
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<div style="padding:16px;color:var(--danger);text-align:center">Ошибка поиска</div>';
    }
}
