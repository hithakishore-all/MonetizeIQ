'use strict';
/**
 * Offline store: reads app/fixtures/snapshot.json (built by data/generate_data.py, the same data
 * as db/04_seed.sql). Decisions and the audit log are kept in memory and reset on restart.
 */
const fs = require('fs');
const path = require('path');
const { normalizeAccount, normalizeEvent } = require('./common');

function createOfflineStore(file) {
  const snapPath = file || path.join(__dirname, '..', '..', 'fixtures', 'snapshot.json');
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const demoToday = snap.config.demo_today;
  const accounts = snap.accounts.map(a => normalizeAccount(a, demoToday));
  const byId = new Map(accounts.map(a => [a.id, a]));
  const events = new Map();
  snap.events.forEach(e => {
    if (!events.has(e.account_id)) events.set(e.account_id, []);
    events.get(e.account_id).push(normalizeEvent(e));
  });
  const decisions = [];
  const audit = [];
  let seq = 0;

  return {
    mode: 'offline',
    async ping() { return true; },
    async config() { return { demoToday }; },
    async catalog() { return snap.catalog; },
    async owners() { return snap.owners; },
    async accounts(categoryId) { return categoryId ? accounts.filter(a => a.categoryId === categoryId) : accounts; },
    async account(id) { return byId.get(id) || null; },
    async events(accountId) {
      return (events.get(accountId) || []).slice().sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));
    },
    async recordAudit(actor, action, accountId, detail) {
      const row = { id: ++seq, at: new Date().toISOString(), actor, action, accountId: accountId || null, detail: detail || {} };
      audit.push(row);
      return row;
    },
    async saveDecision({ key, accountId, model, approverId, inputs }) {
      const existing = decisions.find(d => d.idempotencyKey === key);
      if (existing) return { decision: existing, created: false };
      const decision = { id: decisions.length + 1, idempotencyKey: key, accountId, model, approverId, inputs, createdAt: new Date().toISOString() };
      decisions.push(decision);
      return { decision, created: true };
    },
    async decisions(limit) { return decisions.slice(-(limit || 50)).reverse(); },
    async audit(limit) { return audit.slice(-(limit || 100)).reverse(); },
    async close() {}
  };
}

module.exports = { createOfflineStore };
