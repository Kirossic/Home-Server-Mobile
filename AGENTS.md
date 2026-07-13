# Main-Server — Documentation for AI assistants

## Overview

Server monitoring and management panel for **Android + Termux**.  
Runs on Node.js (pure `http` module, no Express).  
Frontend — vanilla JS/CSS/HTML (no frameworks).

**Host:** Android (Linux armv8l, kernel 6.x)  
**Panel URL:** `http://localhost:8080`  
**IDE (code-server):** `http://localhost:8085`  
**SSH port:** 8022

---

## Project structure

```
/data/data/com.termux/files/home/projects/main-server/
├── server.js          # Backend (Node.js http)
├── package.json       # Dependencies
├── links.json         # Custom links data (persistent)
├── public/
│   ├── index.html     # Main page
│   ├── script.js      # Frontend logic
│   └── style.css      # Styles
├── AGENTS.md          # This file
└── .gitignore
```

---

## Backend (server.js)

### Architecture

Routes are stored in a `routes` object mapping `"METHOD:/path"` → handler function:

```js
const routes = {
  'GET:/api/stats': handleStats,
  'POST:/api/links': handleLinksSave,
  // ...
};
```

Request flow:
1. Check if it's a code-server proxy request → proxy to port 8085
2. Check for static file match (`/`, `/index.html`, `/style.css`, `/script.js`)
3. Match route key `METHOD:/pathname` → call handler
4. Otherwise → 404

### Helper functions

| Function | Purpose |
|---|---|
| `urlParams(req)` | Returns `URLSearchParams` object |
| `getBody(req)` | Returns parsed request body (Promise) |
| `serveFile(res, path, contentType)` | Serves static file with caching headers |
| `json(res, data, status=200)` | Sends JSON response |
| `text(res, data, status=200)` | Sends plain text response |

### API endpoints

| Method | Path | Description |
|---|---|---|
| **Dashboard** | | |
| GET | `/api/stats` | System stats: RAM, disk, uptime, network, OS info, load average |
| GET | `/api/battery` | Battery: percentage, status, temperature, voltage, health, cycles (requires Termux:API app) |
| GET | `/api/tunnel/links` | Cloudflare tunnel URLs (from log files) |
| POST | `/api/login` | Auth: `{ password }` → `{ success }` or `401` |
| **File Manager** | | |
| GET | `/api/files/list?path=` | List directory contents |
| GET | `/api/files/view?path=` | Read file as text |
| POST | `/api/files/save?path=` | Save file (body = content) |
| GET | `/api/files/download?path=` | Download file |
| POST | `/api/files/upload?dir=&name=` | Upload file (raw body) |
| GET | `/api/files/download-dir?path=` | Download directory as ZIP |
| DELETE | `/api/files/delete?path=` | Delete file or directory |
| POST | `/api/files/mkdir?path=` | Create directory |
| POST | `/api/files/create?path=` | Create empty file |
| GET | `/api/files/search?query=&dir=` | Search files by name (`find -iname`) |
| **Processes** | | |
| GET | `/api/processes` | List processes (`ps aux`) |
| POST | `/api/processes/kill` | Kill process: `{ pid }` |
| **Terminal** | | |
| POST | `/api/terminal/exec` | Execute command: `{ cmd, cwd }` |
| **Links** | | |
| GET | `/api/links` | Get custom links (from links.json) |
| POST | `/api/links` | Save custom links (body = JSON array) |
| GET | `/api/links/status` | Ping each link, return `[{ id, online }]` |
| **Autostart** | | |
| GET | `/api/autostart/get` | Read `.bashrc` |
| POST | `/api/autostart/save` | Write `.bashrc` (body = content) |
| **System** | | |
| POST | `/api/system/restart` | Kill all services and restart via `.bashrc` |
| **Logs** | | |
| GET | `/api/logs?name=main-server&lines=50` | Read log file (tail -n) |

### Notable implementation details

- **Auth**: `PANEL_PASSWORD = process.env.PANEL_PW || null`. When set, all API routes (except `/api/login`) check `x-panel-pw` header. Static files are always public.
- **EADDRINUSE handling**: `startServer()` retries 3 times with 2s delay
- **Battery lock**: `batteryLock` prevents concurrent `termux-battery-status` calls (avoids process pileup)
- **ZIP creation**: Uses `archiver` v8 ESM module — `new archiver.ZipArchive()`
- **DiskDetail**: `df -h` output included in `/api/stats`

---

## Frontend (public/)

### Tabs

| Tab | ID | Key functions |
|---|---|---|
| Dashboard | `dashboard` | `updateStats()`, `loadBattery()`, `drawRamChart()`, `loadFiles()` |
| Links | `links` | `loadLinks()`, `loadLinksStatus()`, `saveLink()`, `deleteLink()` |
| IDE | `ide` | `loadProjectsForIDE()` |
| Autostart | `autostart` | `loadBashrc()`, `saveBashrc()` |
| Terminal | `terminal` | `termExec()`, `termClear()` |
| Processes | `processes` | `loadProcesses()`, `killProcess()`, `filterProcesses()` |
| Logs | `logs` | `loadLogs()`, `toggleLogView()`, `renderLogs()` |

### Key frontend patterns

- **AuthFetch**: `authFetch(url, options)` wraps `fetch()`, adds `x-panel-pw` header, shows login overlay on 401
- **Metric detail panel**: clicking a metric in the dashboard hides `.file-list` and `.editor-zone`, shows `#metricPanel`
- **UpdateStats override**: `updateStats` is overridden to add RAM history tracking and chart drawing
- **Log view**: toggle between raw text and structured table (parsed by severity)

### Metric detail panels (shown on click)

| Metric | Displayed data |
|---|---|
| OS | hostname, platform, arch, kernel, release |
| RAM | progress bar, total/used/free GB, history chart |
| Disk | progress bar, total/used |
| Network | all interfaces with addresses |
| Uptime | days, hours, load average (1/5/15) |
| Battery | percentage, status, temperature, voltage, health, cycles |

---

## Environment notes

- **OS**: Android via Termux
- **Shell**: bash
- **Paths**: `$HOME` = `/data/data/com.termux/files/home`
- **Node**: v26.4.0 (via termux)
- **Commands not available**: `zip`, `tar`, `ip` (use `ifconfig`), `htop` (TUI), `fuser` (limited), `dumpsys`
- **Battery**: requires Termux:API app from F-Droid + `termux-api` package
- **Ports**: 8080 (panel), 8085 (code-server), 8022 (SSH)

---

## How to start

```bash
cd ~/projects/main-server
node server.js                     # no auth
PANEL_PW=secret node server.js     # with password
```

Autostart is configured in `~/.bashrc` — starts code-server, panel, and cloudflare tunnels on login.
