'use strict';
/**
 * MonetizeIQ entry point.
 *   npm start              live mode (Postgres via DATABASE_URL), plus Slack if tokens are set
 *   npm run offline        no accounts needed: fixtures snapshot, same engine and API
 */
const { readConfig, checkConfig } = require('./config');
const { createService } = require('./service');
const { createApp } = require('./server');

async function start(overrides) {
  const cfg = Object.assign(readConfig(), overrides || {});
  const { errors, warnings, slackEnabled } = checkConfig(cfg);
  if (errors.length) {
    errors.forEach(e => console.error('[monetizeiq] ' + e));
    const err = new Error(errors.join(' ')); err.configErrors = errors; throw err;
  }
  if (!cfg.quiet) warnings.forEach(w => console.warn('[monetizeiq] ' + w));

  const store = cfg.mode === 'offline'
    ? require('./stores/offline').createOfflineStore(cfg.fixture)
    : require('./stores/postgres').createPostgresStore(cfg.databaseUrl);
  try { await store.ping(); await store.catalog(); }
  catch (e) {
    await store.close();
    throw new Error('Could not read the database: ' + e.message + ' (docs/TROUBLESHOOTING.md#postgres)');
  }
  const service = createService(store);
  const app = createApp(service, { slackEnabled });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(cfg.port, cfg.host, () => resolve(s));
    s.on('error', reject);
  });
  const addr = server.address();
  const url = `http://${addr.address === '::1' ? 'localhost' : addr.address}:${addr.port}`;

  let bot = null;
  if (slackEnabled) {
    bot = require('./slack').createSlackBot(service, cfg);
    await bot.start();
  }
  if (!cfg.quiet) console.log(`[monetizeiq] ${cfg.mode} mode · web console at ${url}${bot ? ' · Slack bot connected' : ''}`);

  let closing = false;
  async function close() {
    if (closing) return; closing = true;
    if (bot) await bot.stop().catch(() => {});
    await new Promise(r => server.close(() => r()));
    await store.close();
  }
  return { url, server, close, mode: cfg.mode };
}

if (require.main === module) {
  start().then(h => {
    const stop = sig => { console.log(`[monetizeiq] ${sig} received, shutting down.`); h.close().then(() => process.exit(0)); };
    process.on('SIGINT', () => stop('SIGINT'));
    process.on('SIGTERM', () => stop('SIGTERM'));
  }).catch(e => { if (!e.configErrors) console.error('[monetizeiq] ' + e.message); process.exit(1); });
}

module.exports = { start };
