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

router.use('/autostart', autostartRoutes);
router.use('/', dashboardRoutes);
router.use('/files', filesRoutes);
router.use('/links', linksRoutes);
router.use('/logs', logsRoutes);
router.use('/processes', processesRoutes);
router.use('/services', servicesRoutes);
router.use('/system', systemRoutes);
router.use('/terminal', terminalRoutes);
router.use('/login', authRoutes);

module.exports = router;