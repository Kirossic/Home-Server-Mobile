# Main-Server — Documentation for AI assistants

## Overview

Server monitoring and management panel for **Android + Termux**.  
Runs on Node.js with Express 5.  
Frontend — vanilla JS/CSS/HTML (no frameworks).

**Host:** Android (Linux armv8l, kernel 6.x)  
**Panel URL:** `http://localhost:8080`  
**IDE (code-server):** `http://localhost:8085`  
**SSH port:** 8022

---

## Project structure

```
/data/data/com.termux/files/home/projects/main-server/
├── backend/
│   └── src/
│       ├── server.js              # Express entry point
│       ├── config/
│       │   ├── constants.js       # Paths, ports, env vars
│       │   ├── database.js        # SQLite init (better-sqlite3)
│       │   └── services.js        # Service registry (SERVICES, SERVICE_AUTOSTART)
│       ├── routes/
│       │   ├── index.js           # Route aggregator
│       │   └── api/               # Domain route files
│       ├── services/
│       │   ├── events.service.js       # Event logger
│       │   └── metrics-collector.js    # Periodic metric collection
│       └── utils/
│           ├── exec.js            # safeExec(command) wrapper
│           └── system.js          # getDiskSpace(), getLocalIP()
├── data/
│   └── metrics.db                # SQLite database (auto-created)
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── links.json
├── package.json
├── AGENTS.md
└── .gitignore
```

---

## Backend architecture

### Request flow (server.js)

1. **Auth middleware** — checks `x-panel-pw` header (skipped for `/api/login`)
2. **express.json()** — parses JSON body
3. **API routes** — routed by domain via `routes/index.js`
4. **Static files** — `public/` directory
5. **Error handler** — catches unhandled errors

### API endpoints

| Method | Path | Description |
|---|---|---|
| **Dashboard** | | |
| GET | `/api/stats` | System stats: RAM, disk, uptime, network, load |
| GET | `/api/battery` | Battery via termux-battery-status |
| GET | `/api/tunnel/links` | Cloudflare tunnel URLs |
| POST | `/api/login` | Auth: `{ password }` → `{ success }` or 401 |
| **File Manager** | | |
| GET | `/api/files/list?path=` | List directory |
| GET | `/api/files/view?path=` | Read file |
| POST | `/api/files/save?path=` | Write file |
| GET | `/api/files/download?path=` | Download file |
| POST | `/api/files/upload?dir=&name=` | Upload file |
| GET | `/api/files/download-dir?path=` | Download directory as ZIP |
| DELETE | `/api/files/delete?path=` | Delete file/dir |
| POST | `/api/files/mkdir?path=` | Create directory |
| POST | `/api/files/create?path=` | Create empty file |
| GET | `/api/files/search?query=&dir=` | Search files |
| **Processes** | | |
| GET | `/api/processes` | List processes |
| POST | `/api/processes/kill` | Kill process |
| **Terminal** | | |
| POST | `/api/terminal/exec` | Execute shell command |
| **Links** | | |
| GET | `/api/links` | Get custom links |
| POST | `/api/links` | Save custom links |
| GET | `/api/links/status` | Ping links → `[{ id, online }]` |
| **Autostart** | | |
| GET | `/api/autostart/get` | Read .bashrc |
| POST | `/api/autostart/save` | Write .bashrc |
| **System** | | |
| POST | `/api/system/restart` | Kill all + restart via .bashrc |
| **Logs** | | |
| GET | `/api/logs?name=&lines=` | Tail log file |
| **Metrics & Events** | | |
| GET | `/api/metrics/:type?limit=&from=&to=` | Historical metrics (ram/battery/storage) |
| GET | `/api/events?type=&limit=` | Event log |
| POST | `/api/events` | Write event `{ type, detail, level }` |
| **Services** | | |
| GET | `/api/services` | Service statuses |
| POST | `/api/services/start` | Start service |
| POST | `/api/services/stop` | Stop service |
| POST | `/api/services/autostart` | Toggle autostart |

### SQLite Database (`data/metrics.db`)

Tables:
- `metrics_ram` — RAM + load average (every 60s)
- `metrics_battery` — battery state (every 5min)
- `metrics_storage` — disk usage per mount (every 10min)
- `events` — typed event log (server_start, service_*, links_*, etc.)

Collector starts automatically with the server. ~50-60MB/year estimated size.

### Notable implementation details

- **execCommand(cmd, opts)** — wrapper in `utils/exec.js`, always resolves `{ stdout, stderr, exitCode }`
- **PANEL_PASSWORD** — from `process.env.PANEL_PW`, checked via auth middleware
- **Battery lock** — `batteryLock` prevents concurrent termux-battery-status calls
- **ZIP creation** — uses `archiver('zip', { zlib: { level: 9 } })`

---

## Frontend (public/)

### Tabs

| Tab | ID | Key functions |
|---|---|---|
| Dashboard | `dashboard` | `updateStats()`, `loadBattery()`, `drawRamChart()`, `loadFiles()` |
| Links | `links` | `loadLinks()`, `saveLink()`, `deleteLink()` |
| IDE | `ide` | `loadProjectsForIDE()` |
| Autostart | `autostart` | `loadBashrc()`, `saveBashrc()` |
| Terminal | `terminal` | `termExec()`, `termClear()` |
| Processes | `processes` | `loadProcesses()`, `killProcess()`, `filterProcesses()` |
| Logs | `logs` | `loadLogs()`, `toggleLogView()`, `renderLogs()` |
| Services | `services` | `loadServices()`, `toggleService()`, `toggleAutostart()` |
| Metrics | `metrics` | `loadMetrics()`, `loadEvents()` |

### Key patterns

- **authFetch** — wraps `fetch()`, adds `x-panel-pw` header, shows login on 401
- **Metric detail panel** — clicking a metric shows `#metricPanel`
- **Ram chart** — canvas-based chart in RAM detail panel

---

## Environment notes

- **OS**: Android via Termux
- **Shell**: bash
- **Node**: v26+ (via termux)
- **Commands not available**: `zip`, `tar`, `ip` (use `ifconfig`), `htop` (TUI), `fuser` (limited), `dumpsys`
- **Battery**: requires Termux:API app from F-Droid + `termux-api` package
- **Ports**: 8080 (panel), 8085 (code-server), 8022 (SSH)

---

## How to start

```bash
cd ~/projects/main-server
node backend/src/server.js              # no auth
PANEL_PW=secret node backend/src/server.js  # with password
```

Autostart is configured in `~/.bashrc` — starts code-server, panel, and cloudflare tunnels on login.
