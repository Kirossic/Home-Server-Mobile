let termHistory = [];
let termHistoryIdx = -1;

function stripAnsi(str) {
    return (str || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function initTerminalKeybindings() {
    const input = document.getElementById('terminalInput');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = 'true';

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            if (termHistory.length === 0) return;
            e.preventDefault();
            if (termHistoryIdx > 0) termHistoryIdx--;
            input.value = termHistory[termHistoryIdx] || '';
        } else if (e.key === 'ArrowDown') {
            if (termHistory.length === 0) return;
            e.preventDefault();
            if (termHistoryIdx < termHistory.length - 1) {
                termHistoryIdx++;
                input.value = termHistory[termHistoryIdx] || '';
            } else {
                termHistoryIdx = termHistory.length;
                input.value = '';
            }
        }
    });
}

async function termExec(cmd) {
    initTerminalKeybindings();
    if (!cmd) {
        const input = document.getElementById('terminalInput');
        cmd = input ? input.value.trim() : '';
        if (!cmd) return;
        input.value = '';
    }

    termHistory.push(cmd);
    termHistoryIdx = termHistory.length;

    const output = document.getElementById('terminalOutput');
    if (output) {
        output.textContent += '\n$ ' + cmd + '\n';
        output.scrollTop = output.scrollHeight;
    }

    try {
        const res = await authFetch('/api/terminal/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, cwd: currentPath || undefined })
        });
        const data = await res.json();
        if (output) {
            if (data.stdout) output.textContent += stripAnsi(data.stdout);
            if (data.stderr) output.textContent += '\n[stderr] ' + stripAnsi(data.stderr);
            if (data.exitCode && data.exitCode !== 0) output.textContent += '\n[Exit code: ' + data.exitCode + ']';
        }
    } catch(e) {
        if (output) output.textContent += '\n[Ошибка: ' + e.message + ']';
    }

    if (output) output.scrollTop = output.scrollHeight;
    const termInput = document.getElementById('terminalInput');
    if (termInput) termInput.focus();
}

function termClear() {
    const output = document.getElementById('terminalOutput');
    if (output) {
        output.textContent = 'Добро пожаловать в Web Terminal Redmi Server. Введите команду или выберите чип выше.';
    }
}

function toggleTerminalFullscreen() {
    const box = document.getElementById('terminalBox');
    const btn = document.getElementById('termFsBtn');
    if (!box) return;

    box.classList.toggle('fullscreen');
    if (btn) {
        btn.textContent = box.classList.contains('fullscreen') ? '✕ Свернуть' : '⛶ Экран';
    }
}

function copyTerminalOutput() {
    const output = document.getElementById('terminalOutput');
    if (!output || !output.textContent.trim()) {
        showToast('Вывод терминала пуст', 'warn');
        return;
    }
    copyToClipboard(output.textContent, 'Вывод терминала скопирован!');
}
