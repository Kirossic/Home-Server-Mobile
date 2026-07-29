let termHistory = [];
let termHistoryIdx = -1;

async function termExec(cmd) {
    if (!cmd) {
        const input = document.getElementById('terminalInput');
        cmd = input.value.trim();
        if (!cmd) return;
        input.value = '';
    }
    const output = document.getElementById('terminalOutput');
    output.textContent += '\n$ ' + cmd + '\n';
    output.scrollTop = output.scrollHeight;
    try {
        const res = await authFetch('/api/terminal/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd, cwd: currentPath || undefined })
        });
        const data = await res.json();
        if (data.stdout) output.textContent += data.stdout;
        if (data.stderr) output.textContent += '\x1b[31m' + data.stderr + '\x1b[0m';
        if (data.exitCode && data.exitCode !== 0) output.textContent += '\n[Exit code: ' + data.exitCode + ']';
    } catch(e) {
        output.textContent += '\n[Ошибка: ' + e.message + ']';
    }
    output.scrollTop = output.scrollHeight;
    document.getElementById('terminalInput').focus();
}

function termClear() {
    document.getElementById('terminalOutput').textContent = 'Добро пожаловать в Web Terminal. Нажмите ⏎ чтобы выполнить команду.';
}
