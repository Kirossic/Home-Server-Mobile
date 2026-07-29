const { exec } = require('child_process');

function execCommand(cmd, options = {}) {
    const {timeout = 30000, cwd, shell} = options;

    return new Promise((resolve, reject) => {
        exec(cmd, {timeout, cwd, shell}, (error, stdout, stderr) => {
            const exitCode = error ? (error.code || 1) : 0;
            if (error && exitCode > 1) {
                console.error(`[exec] exit=${exitCode}\ncmd="${cmd.slice(0, 100)}" \nError: ${error.message}`);
            }
            resolve({ stdout: stdout || '', stderr: stderr || '', exitCode });
        });
    });
}

module.exports = { execCommand };