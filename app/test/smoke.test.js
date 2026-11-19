'use strict';
/**
 * End-to-end smoke test: starts the real server in offline mode on a free port and walks the
 * whole workflow through the HTTP API, including every guardrail and failure path.
 * Run: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../src/index');

let h, base, accounts;
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json().catch(() => null), text: r.headers.get('content-type') }; };
const post = async (p, body, raw) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw || JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const scen = n => accounts.find(a => a.scen === n);

test.before(async () => {
  h = await start({ mode: 'offline', port: 0, host: '127.0.0.1', noSlack: true, quiet: true });
  base = h.url;
  accounts = (await get('/api/accounts')).body;
});
test.after(async () => { if (h) await h.close(); });

test('health reports offline mode and the pinned demo date', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.mode, 'offline');
  assert.equal(r.body.demoToday, '2026-11-18');
});

test('catalog has 12 AI categories and 10 scenarios', async () => {
  const r = await get('/api/catalog');
  assert.equal(r.body.categories.length, 12);
  assert.equal(r.body.scenarios.length, 10);
  for (const c of r.body.categories) assert.ok(c.unit && c.source && c.rule && c.trail, `playbook incomplete for ${c.id}`);
});

test('accounts: whole book, one category, unknown category', async () => {
  assert.equal(accounts.length, 12 * 96);
  assert.equal((await get('/api/accounts?category=support')).body.length, 96);
  assert.equal((await get('/api/accounts?category=nope')).status, 404);
  for (let n = 1; n <= 10; n++) assert.ok(scen(n), `scenario ${n} account missing`);
});

test('book summary computes all four models and validates parameters', async () => {
  const r = await get('/api/book/support?tokp=2&cmode=pass&markup=30');
  assert.equal(r.status, 200);
  for (const m of ['seat', 'credit', 'hybrid', 'outcome']) assert.ok(r.body.annual[m] > 0, m);
  assert.ok(Math.abs(r.body.grossMargin.credit - 30 / 130) < 1e-3, 'pass-through margin equals markup / (1 + markup)');
  assert.equal((await get('/api/book/support?tokp=abc')).status, 400);
  assert.equal((await get('/api/book/support?cmode=free')).status, 400);
  assert.equal((await get('/api/book/unknown')).status, 404);
});

test('scenario 1 (hero run) gets a recommendation with traceable evidence', async () => {
  const a = scen(1);
  const rec = (await get(`/api/accounts/${a.id}/recommendation`)).body;
  assert.equal(rec.status, 'ok');
  const ev = (await get(`/api/accounts/${a.id}/events`)).body;
  assert.equal(ev.length, 8);
  for (const e of ev) assert.match(e.evidenceId, /^HD-EV-\d{6}$/);
  assert.ok(ev.some(e => e.status === 'verified' && e.billed > 0));
});

test('scenario 2 (light adopter) is steered to a hybrid floor', async () => {
  const rec = (await get(`/api/accounts/${scen(2).id}/recommendation`)).body;
  assert.equal(rec.model, 'hybrid');
  assert.match(rec.reason, /Light adopter/);
});

test('scenario 3 (readiness gate) never recommends or approves pure outcome', async () => {
  const a = scen(3);
  const rec = (await get(`/api/accounts/${a.id}/recommendation`)).body;
  assert.equal(rec.gateBlocksOutcome, true);
  assert.notEqual(rec.model, 'outcome');
  const r = await post('/api/decisions', { accountId: a.id, model: 'outcome', approverId: a.ownerId });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'readiness_gate');
});

test('scenario 8 (stale data) is withheld and cannot be approved', async () => {
  const a = scen(8);
  const rec = (await get(`/api/accounts/${a.id}/recommendation`)).body;
  assert.equal(rec.status, 'withheld');
  assert.equal(rec.code, 'stale_data');
  const r = await post('/api/decisions', { accountId: a.id, model: 'hybrid', approverId: a.ownerId });
  assert.equal(r.status, 409);
});

test('scenario 9 (missing signal) shows unknown, not $0, and is excluded from totals', async () => {
  const a = scen(9);
  const d = (await get(`/api/accounts/${a.id}`)).body;
  assert.equal(d.bills.outcome, null);
  assert.equal(d.recommendation.code, 'missing_signal');
  const book = (await get(`/api/book/${a.categoryId}`)).body;
  assert.ok(book.excludedMissingSignal >= 1);
  const ev = (await get(`/api/accounts/${a.id}/events`)).body;
  assert.ok(ev.every(e => e.status === 'no_signal' && e.billed === 0));
});

test('approval: owner only, idempotent, and audited', async () => {
  const a = scen(1);
  const rec = (await get(`/api/accounts/${a.id}/recommendation`)).body;
  const notOwner = (await get('/api/owners')).body.find(o => o.id !== a.ownerId);
  const refused = await post('/api/decisions', { accountId: a.id, model: rec.model, approverId: notOwner.id });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'not_owner');
  const first = await post('/api/decisions', { accountId: a.id, model: rec.model, approverId: a.ownerId });
  assert.equal(first.status, 201);
  assert.equal(first.body.created, true);
  const again = await post('/api/decisions', { accountId: a.id, model: rec.model, approverId: a.ownerId });
  assert.equal(again.status, 200);
  assert.equal(again.body.decision.id, first.body.decision.id);
  const audit = (await get('/api/audit')).body;
  assert.ok(audit.some(x => x.action === 'decision_recorded' && x.accountId === a.id));
  assert.ok(audit.some(x => x.action === 'approval_refused' && x.detail.reason === 'not_owner'));
  assert.equal(audit.filter(x => x.action === 'decision_recorded' && x.accountId === a.id).length, 1, 'repeat approval writes no second decision');
});

test('bad input returns clear 4xx errors', async () => {
  assert.equal((await post('/api/decisions', null, '{not json')).status, 400);
  assert.equal((await post('/api/decisions', { accountId: 'support-001' })).status, 400);
  assert.equal((await post('/api/decisions', { accountId: 'support-001', model: 'hybrid', approverId: 'nobody' })).status, 400);
  assert.equal((await post('/api/decisions', { accountId: 'no-such', model: 'hybrid', approverId: 'riley' })).status, 404);
  assert.equal((await get('/api/accounts/no-such')).status, 404);
  assert.equal((await get('/api/nothing-here')).status, 404);
});

test('web console and shared engine are served', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /MonetizeIQ/);
  const e = await fetch(base + '/engine.js');
  assert.equal(e.status, 200);
});

test('Slack message: approve button only when a recommendation can be approved', async () => {
  const { accountBlocks } = require('../src/slack');
  const ok = (await get(`/api/accounts/${scen(1).id}`)).body;
  const withheld = (await get(`/api/accounts/${scen(8).id}`)).body;
  assert.ok(accountBlocks(ok).some(b => b.type === 'actions'));
  assert.ok(!accountBlocks(withheld).some(b => b.type === 'actions'));
});

test('config check names the missing setting and the doc step', async () => {
  const { checkConfig } = require('../src/config');
  const r = checkConfig({ mode: 'live', port: 3000, databaseUrl: '', slack: { botToken: 'xoxb-1', appToken: 'bad', approvers: {} } });
  assert.match(r.errors[0], /DATABASE_URL.*SETUP_POSTGRES\.md/);
  assert.match(r.warnings[0], /SLACK_APP_TOKEN.*SETUP_SLACK\.md/);
  assert.equal(r.slackEnabled, false);
});
