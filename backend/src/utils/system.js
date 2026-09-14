const os = require('os');
const fs = require('fs');
const { execCommand } = require('./exec');

function getShellPath() {
    const termuxBash = '/data/data/com.termux/files/usr/bin/bash';
    if (fs.existsSync(termuxBash)) return termuxBash;
    if (fs.existsSync('/bin/bash')) return '/bin/bash';
    return process.env.SHELL || '/bin/sh';
}

function getDiskSpace() {
    return execCommand('df -h /data 2>/dev/null').then(({stdout}) => {
        if (!stdout) return {total: '-', used: '-'};
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return {total: '-', used: '-'};
        const parts = lines[1].replace(/\s+/g, ' ').split(' ')
        return {total: parts[1] || '-', used: parts[2] || '-' };
    });
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

module.exports = { getDiskSpace, getLocalIP, getShellPath };