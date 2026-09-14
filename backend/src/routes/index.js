const express = require('express');
const router = express.Router();

const authRoutes = require('./api/auth.routes');
const autostartRoutes = require('./api/autostart.routes');
const dashboardRoutes = require('./api/dashboard.routes');
const filesRoutes = require('./api/files.routes');
const linksRoutes = require('./api/links.routes');
const logsRoutes = require('./api/logs.routes');
const processesRoutes = require('./api/processes.routes');
const servicesRoutes = require('./api/services.routes');
const systemRoutes = require('./api/system.routes');
const terminalRoutes = require('./api/terminal.routes');
const metricsRoutes = require('./api/metrics.routes');
const eventsRoutes = require('./api/events.routes');
const tunnelRoutes = require('./api/tunnel.routes');
const settingsRoutes = require('./api/settings.routes');

router.use('/autostart', autostartRoutes);
router.use('/tunnel', tunnelRoutes);
router.use('/settings', settingsRoutes);
router.use('/', dashboardRoutes);
router.use('/files', filesRoutes);
router.use('/links', linksRoutes);
router.use('/logs', logsRoutes);
router.use('/processes', processesRoutes);
router.use('/services', servicesRoutes);
router.use('/system', systemRoutes);
router.use('/terminal', terminalRoutes);
router.use('/metrics', metricsRoutes);
router.use('/events', eventsRoutes);
router.use('/login', authRoutes);

module.exports = router;