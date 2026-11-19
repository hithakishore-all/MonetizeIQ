'use strict';
/**
 * Creates the schema, tables, views, seed data and grants by running db/01..05 in order.
 * Uses DATABASE_ADMIN_URL if set (a role that can create schemas and roles), else DATABASE_URL.
 * Safe to re-run: tables are dropped and recreated, then reseeded.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadDotEnv } = require('../src/config');

loadDotEnv(path.join(__dirname, '..', '.env'));
const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[db:setup] Set DATABASE_ADMIN_URL or DATABASE_URL in app/.env first (docs/SETUP_POSTGRES.md, step 2).');
  process.exit(1);
}
const dir = path.join(__dirname, '..', '..', 'db');
const files = ['01_setup.sql', '02_tables.sql', '03_views.sql', '04_seed.sql', '05_grants.sql'];

(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) {
      process.stdout.write(`[db:setup] ${f} ... `);
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      console.log('done');
    }
    const n = await client.query('SELECT (SELECT count(*) FROM monetizeiq.accounts) AS accounts, (SELECT count(*) FROM monetizeiq.outcome_events) AS events');
    console.log(`[db:setup] ready: ${n.rows[0].accounts} accounts, ${n.rows[0].events} outcome events.`);
  } catch (e) {
    console.error('\n[db:setup] failed: ' + e.message + ' (docs/TROUBLESHOOTING.md#postgres)');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
