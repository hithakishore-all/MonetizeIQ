'use strict';
/**
 * Live store: Postgres through the governed views. Uses DATABASE_URL.
 * The app role can read views and the catalog and can only insert decisions and audit rows.
 */
const { Pool } = require('pg');
const { normalizeAccount, normalizeEvent } = require('./common');

function createPostgresStore(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  let cache = null;

  async function load() {
    if (cache) return cache;
    const cfg = await pool.query('SELECT key, value FROM monetizeiq.app_config');
    const conf = Object.fromEntries(cfg.rows.map(r => [r.key, r.value]));
    if (!conf.demo_today || !conf.catalog_meta) throw new Error('Database is not seeded: run npm run db:setup (docs/SETUP_POSTGRES.md, step 3).');
    const cats = await pool.query('SELECT definition FROM monetizeiq.categories ORDER BY id');
    const meta = JSON.parse(conf.catalog_meta);
    const order = meta.categoryOrder || null;
    let categories = cats.rows.map(r => r.definition);
    if (order) categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const owners = (await pool.query('SELECT id, name, email, role FROM monetizeiq.owners ORDER BY id')).rows;
    cache = { demoToday: conf.demo_today, catalog: Object.assign({}, meta, { categories }), owners };
    return cache;
  }

  return {
    mode: 'live',
    async ping() { await pool.query('SELECT 1'); return true; },
    async config() { const c = await load(); return { demoToday: c.demoToday }; },
    async catalog() { return (await load()).catalog; },
    async owners() { return (await load()).owners; },
    async accounts(categoryId) {
      const c = await load();
      const sql = 'SELECT * FROM monetizeiq.v_account_book' + (categoryId ? ' WHERE category_id = $1' : '') + ' ORDER BY id';
      const res = await pool.query(sql, categoryId ? [categoryId] : []);
      return res.rows.map(r => normalizeAccount(r, c.demoToday));
    },
    async account(id) {
      const c = await load();
      const res = await pool.query('SELECT * FROM monetizeiq.v_account_book WHERE id = $1', [id]);
      return res.rows[0] ? normalizeAccount(res.rows[0], c.demoToday) : null;
    },
    async events(accountId) {
      const res = await pool.query('SELECT * FROM monetizeiq.v_outcome_evidence WHERE account_id = $1 ORDER BY occurred_at DESC', [accountId]);
      return res.rows.map(normalizeEvent);
    },
    async recordAudit(actor, action, accountId, detail) {
      const res = await pool.query('INSERT INTO monetizeiq.audit_log (actor, action, account_id, detail) VALUES ($1, $2, NULLIF($3, \'\'), $4) RETURNING id, at',
        [actor, action, accountId || '', JSON.stringify(detail || {})]);
      return { id: Number(res.rows[0].id), at: res.rows[0].at, actor, action, accountId, detail };
    },
    async saveDecision({ key, accountId, model, approverId, inputs }) {
      const ins = await pool.query(
        'INSERT INTO monetizeiq.decisions (idempotency_key, account_id, model, approver_id, inputs) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *',
        [key, accountId, model, approverId, JSON.stringify(inputs || {})]);
      const created = ins.rowCount === 1;
      const row = created ? ins.rows[0] : (await pool.query('SELECT * FROM monetizeiq.decisions WHERE idempotency_key = $1', [key])).rows[0];
      return { created, decision: { id: Number(row.id), idempotencyKey: row.idempotency_key, accountId: row.account_id, model: row.model,
        approverId: row.approver_id, inputs: row.inputs, createdAt: new Date(row.created_at).toISOString() } };
    },
    async decisions(limit) {
      const res = await pool.query('SELECT * FROM monetizeiq.decisions ORDER BY id DESC LIMIT $1', [limit || 50]);
      return res.rows.map(r => ({ id: Number(r.id), idempotencyKey: r.idempotency_key, accountId: r.account_id, model: r.model, approverId: r.approver_id, inputs: r.inputs, createdAt: new Date(r.created_at).toISOString() }));
    },
    async audit(limit) {
      const res = await pool.query('SELECT * FROM monetizeiq.audit_log ORDER BY id DESC LIMIT $1', [limit || 100]);
      return res.rows.map(r => ({ id: Number(r.id), at: new Date(r.at).toISOString(), actor: r.actor, action: r.action, accountId: r.account_id, detail: r.detail }));
    },
    async close() { await pool.end(); }
  };
}

module.exports = { createPostgresStore };
