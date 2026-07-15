const path = require('path');
const os = require('os');

const START_DIR = os.homedir();
const HOME_DIR = path.join(START_DIR, 'projects');

module.exports = {
    PORT: 8080,
    HOST: '0.0.0.0',
    IDE_PORT: 8085,
    START_DIR,
    BASHRC_PATH: path.join(START_DIR, '.bashrc'),
    LINKS_PATH: path.resolve(__dirname, '../../links.json'),
    PROJECTS_DIR: HOME_DIR,
    PG_DIR: path.join(START_DIR, '..', 'usr', 'var', 'lib', 'postgresql'),
    PANEL_PASSWORD: process.env.PANEL_PW || '',
};