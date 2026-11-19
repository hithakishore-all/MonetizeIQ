'use strict';
/** Reads settings from app/.env and the environment, and explains exactly what is missing. */
const fs = require('fs');
const path = require('path');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

function readConfig(argv, env) {
  argv = argv || process.argv.slice(2);
  if (!env) { loadDotEnv(path.join(__dirname, '..', '.env')); env = process.env; }
  const offline = argv.includes('--offline') || env.MONETIZEIQ_MODE === 'offline';
  const portArg = argv.find(a => a.startsWith('--port='));
  const cfg = {
    mode: offline ? 'offline' : 'live',
    host: env.MONETIZEIQ_HOST || '127.0.0.1',
    port: portArg ? Number(portArg.split('=')[1]) : Number(env.MONETIZEIQ_PORT || env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || '',
    slack: { botToken: env.SLACK_BOT_TOKEN || '', appToken: env.SLACK_APP_TOKEN || '', approvers: parseApprovers(env.SLACK_APPROVERS || '') },
    noSlack: argv.includes('--no-slack')
  };
  return cfg;
}

/** "U01ABC=riley,U02DEF=jordan" -> { U01ABC: 'riley', U02DEF: 'jordan' } */
function parseApprovers(s) {
  return Object.fromEntries(s.split(',').map(x => x.trim()).filter(Boolean).map(x => x.split('=').map(y => y.trim())).filter(p => p[0] && p[1]));
}

/** Returns { errors, warnings, slackEnabled } with fixes that name the doc step. */
function checkConfig(cfg) {
  const errors = [], warnings = [];
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) errors.push(`MONETIZEIQ_PORT "${cfg.port}" is not a valid port.`);
  if (cfg.mode === 'live' && !cfg.databaseUrl) {
    errors.push('Live mode needs DATABASE_URL in app/.env (docs/SETUP_POSTGRES.md, step 4). To try it without a database, run: npm run offline');
  }
  const { botToken, appToken } = cfg.slack;
  let slackEnabled = false;
  if (!cfg.noSlack && (botToken || appToken)) {
    if (!botToken.startsWith('xoxb-')) warnings.push('Slack bot is off: SLACK_BOT_TOKEN is missing or does not start with xoxb- (docs/SETUP_SLACK.md, step 4).');
    else if (!appToken.startsWith('xapp-')) warnings.push('Slack bot is off: SLACK_APP_TOKEN is missing or does not start with xapp- (docs/SETUP_SLACK.md, step 5).');
    else slackEnabled = true;
    if (slackEnabled && !Object.keys(cfg.slack.approvers).length) warnings.push('SLACK_APPROVERS is empty, so nobody can approve from Slack (docs/SETUP_SLACK.md, step 6).');
  } else if (!cfg.noSlack) {
    warnings.push('Slack bot is off (no tokens). The web console works without it; see docs/SETUP_SLACK.md to turn it on.');
  }
  return { errors, warnings, slackEnabled };
}

module.exports = { readConfig, checkConfig, parseApprovers, loadDotEnv };
