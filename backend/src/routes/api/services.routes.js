const express = require('express');
const router = express.Router();

const { path, os, fs, exec, BASHRC_PATH, SERVICES, SERVICE_AUTOSTART } = require('./_shared');

async function handleServicesStatus(req, res) {
  const results = [];
  for (const s of Object.values(SERVICES)) {
    const running = await new Promise(resolve => {
      exec(s.checkCmd, (err) => resolve(!err));
    });
    let bashrc = '';
    try { bashrc = fs.readFileSync(BASHRC_PATH, 'utf-8'); } catch(e) {}
    const autostart = bashrc.includes('#service-' + s.id);
    results.push({ id: s.id, label: s.label, desc: s.desc, icon: s.icon, running, autostart });
  }
  res.json(results);
}

function handleServiceStart(req, res) {
  let body = '';
  req.on('data', c => body += c.toString());
  req.on('end', () => {
    try {
      const { name } = JSON.parse(body);
      const svc = SERVICES[name];
      if (!svc) return res.status(400).json({ error: 'Unknown service' });
      exec(svc.startCmd, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        setTimeout(() => res.json({ success: true }), 500);
      });
    } catch (e) {
      res.status(400).json({ error: 'invalid request' });
    }
  });
}

function handleServiceStop(req, res) {
  let body = '';
  req.on('data', c => body += c.toString());
  req.on('end', () => {
    try {
      const { name } = JSON.parse(body);
      const svc = SERVICES[name];
      if (!svc) return res.status(400).json({ error: 'Unknown service' });
      exec(svc.stopCmd, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        setTimeout(() => res.json({ success: true }), 1000);
      });
    } catch (e) {
      res.status(400).json({ error: 'invalid request' });
    }
  });
}

function handleServiceAutostart(req, res) {
  let body = '';
  req.on('data', c => body += c.toString());
  req.on('end', () => {
    try {
      const { name, enabled } = JSON.parse(body);
      const svc = SERVICES[name];
      if (!svc) return res.status(400).json({ error: 'Unknown service' });
      let bashrc = '';
      try { bashrc = fs.readFileSync(BASHRC_PATH, 'utf-8'); } catch(e) { bashrc = ''; }
      const marker = '#service-' + svc.id;
      const endMarker = '#/service-' + svc.id;
      const regex = new RegExp(marker + '[\\s\\S]*?' + endMarker + '\\n?', '');
      if (enabled) {
        if (bashrc.includes(marker)) return res.json({ success: true });
        bashrc = bashrc.trimEnd() + '\n\n' + SERVICE_AUTOSTART[svc.id] + '\n';
      } else {
        bashrc = bashrc.replace(regex, '').replace(/\n{2,}/g, '\n').trimEnd() + '\n';
      }
      fs.writeFileSync(BASHRC_PATH, bashrc, 'utf-8');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

router.get('/', handleServicesStatus);
router.post('/start', handleServiceStart);
router.post('/stop', handleServiceStop);
router.post('/autostart', handleServiceAutostart);

module.exports = router;