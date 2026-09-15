const express = require('express');
const router = express.Router();
const fs = require('fs');
const { execCommand } = require('../../utils/exec');
const { BASHRC_PATH } = require('../../config/constants');
const { SERVICES, SERVICE_AUTOSTART } = require('../../config/services');
const { logEvent } = require('../../services/events.service');

async function handleServicesStatus(req, res) {
  const results = [];
  let bashrc = '';
  try { bashrc = fs.readFileSync(BASHRC_PATH, 'utf-8'); } catch(e) {}

  for (const s of Object.values(SERVICES)) {
    const { exitCode } = await execCommand(s.checkCmd);
    const running = exitCode === 0;
    const autostart = bashrc.includes('#service-' + s.id);
    results.push({ id: s.id, label: s.label, desc: s.desc, icon: s.icon, running, autostart });
  }
  res.json(results);
}

async function handleServiceStart(req, res) {
  try {
    const { name } = req.body;
    const svc = SERVICES[name];
    if (!svc) return res.status(400).json({ error: 'Unknown service' });
    await execCommand(svc.startCmd);
    logEvent('service_start', { service: name, label: svc.label });
    setTimeout(() => res.json({ success: true }), 500);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
async function handleServiceStop(req, res) {
  try {
    const { name } = req.body;
    const svc = SERVICES[name];
    if (!svc) return res.status(400).json({ error: 'Unknown service' });
    await execCommand(svc.stopCmd);
    logEvent('service_stop', { service: name, label: svc.label });
    setTimeout(() => res.json({ success: true }), 1000);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

async function handleServiceAutostart(req, res) {
  try {
    const { name, enabled } = req.body;
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
}

router.get('/', handleServicesStatus);
router.post('/start', handleServiceStart);
router.post('/stop', handleServiceStop);
router.post('/autostart', handleServiceAutostart);

module.exports = router;