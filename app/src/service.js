'use strict';
/**
 * Business rules shared by the web API and the Slack bot. Both front ends call these functions,
 * so a recommendation or approval behaves the same wherever it happens.
 */
const MIQ = require('../public/engine.js');

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const NUM_PARAMS = { markup: [0, 300], tokp: [0.05, 60], ktokMult: [0.1, 5], price: [0, 100000], shift: [-30, 30], win: [0, 365], fee: [0, 100], cap: [1, 10] };

function createService(store) {
  async function category(id) {
    const cat = (await store.catalog()).categories.find(c => c.id === id);
    if (!cat) throw new HttpError(404, 'unknown_category', `No category "${id}". See GET /api/catalog for the list.`);
    return cat;
  }

  /** Validate scenario parameters from a query string or body; unknown keys are ignored. */
  function params(cat, raw, pricing) {
    const P = MIQ.defaults(cat, pricing);
    if (!raw) return P;
    if (raw.cmode != null) {
      if (!['action', 'pass', 'byok'].includes(raw.cmode)) throw new HttpError(400, 'bad_param', 'cmode must be action, pass or byok.');
      P.cmode = raw.cmode;
    }
    for (const [k, [lo, hi]] of Object.entries(NUM_PARAMS)) {
      if (raw[k] == null || raw[k] === '') continue;
      const v = Number(raw[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, 'bad_param', `${k} must be a number from ${lo} to ${hi}.`);
      P[k] = v;
    }
    return P;
  }

  async function pricing() { return (await store.catalog()).pricing; }

  async function accountDetail(id) {
    const a = await store.account(id);
    if (!a) throw new HttpError(404, 'unknown_account', `No account "${id}".`);
    const cat = await category(a.categoryId), pr = await pricing();
    const P = MIQ.defaults(cat, pr);
    const owners = await store.owners();
    return {
      account: a,
      owner: owners.find(o => o.id === a.ownerId) || null,
      profile: MIQ.profile(cat, a),
      bills: MIQ.calc(a, cat, P, pr).rev,
      recommendation: MIQ.recommend(a, cat, P, pr)
    };
  }

  async function book(categoryId, raw) {
    const cat = await category(categoryId), pr = await pricing();
    const P = params(cat, raw, pr);
    const T = MIQ.aggregate(await store.accounts(categoryId), cat, P, pr);
    const r = MIQ.readiness(cat);
    return {
      category: categoryId, params: P, readiness: { score: Math.round(r.v), path: r.t },
      annual: Object.fromEntries(MIQ.MODELS.map(m => [m, Math.round(T.rev[m] * 12)])),
      grossMargin: Object.fromEntries(MIQ.MODELS.map(m => [m, Number(T.margin[m].toFixed(4))])),
      forecastRange: Object.fromEntries(MIQ.MODELS.map(m => [m, Number((1.28 * T.cv[m]).toFixed(4))])),
      tokenSpendAnnual: Math.round(T.tok * 12),
      accounts: T.rows.length, excludedMissingSignal: T.excluded
    };
  }

  async function recommendation(id, actor) {
    const d = await accountDetail(id);
    await store.recordAudit(actor || 'api', d.recommendation.status === 'ok' ? 'recommendation_shown' : 'recommendation_withheld', id,
      { model: d.recommendation.model, code: d.recommendation.code });
    return d;
  }

  /**
   * Record an owner's approval. Never touches billing. Rules:
   * only the account owner approves; withheld recommendations cannot be approved;
   * pure outcome is refused below the readiness gate; repeats with the same key return the first decision.
   */
  async function approve(body, actor) {
    const { accountId, model, approverId } = body || {};
    if (!accountId || typeof accountId !== 'string') throw new HttpError(400, 'bad_request', 'accountId is required.');
    if (!MIQ.MODELS.includes(model)) throw new HttpError(400, 'bad_request', 'model must be seat, credit, hybrid or outcome.');
    if (!approverId || typeof approverId !== 'string') throw new HttpError(400, 'bad_request', 'approverId is required.');
    const d = await accountDetail(accountId);
    const owners = await store.owners();
    if (!owners.find(o => o.id === approverId)) throw new HttpError(400, 'unknown_approver', `No owner "${approverId}".`);
    if (approverId !== d.account.ownerId) {
      await store.recordAudit(actor || approverId, 'approval_refused', accountId, { reason: 'not_owner', approverId, model });
      throw new HttpError(403, 'not_owner', `Only the account owner (${d.owner ? d.owner.name : d.account.ownerId}) can approve pricing for ${d.account.name}.`);
    }
    if (d.recommendation.status !== 'ok') {
      await store.recordAudit(actor || approverId, 'approval_refused', accountId, { reason: d.recommendation.code, model });
      throw new HttpError(409, d.recommendation.code, d.recommendation.reason);
    }
    if (model === 'outcome' && d.recommendation.gateBlocksOutcome) {
      await store.recordAudit(actor || approverId, 'approval_refused', accountId, { reason: 'readiness_gate', model });
      throw new HttpError(409, 'readiness_gate', `Pure outcome pricing is blocked: readiness ${d.recommendation.readiness} is below the gate.`);
    }
    const key = body.idempotencyKey && String(body.idempotencyKey).slice(0, 120) || `${accountId}:${model}:${approverId}`;
    const { decision, created } = await store.saveDecision({ key, accountId, model, approverId,
      inputs: { recommended: d.recommendation.model, bills: d.bills, readiness: d.recommendation.readiness } });
    if (created) await store.recordAudit(actor || approverId, 'decision_recorded', accountId, { model, decisionId: decision.id });
    return { decision, created, note: 'Billing is unchanged; a billing platform can pick this up.' };
  }

  async function findAccount(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const all = await store.accounts();
    const exact = all.filter(a => a.name.toLowerCase() === q || a.id === q);
    return exact.length ? exact : all.filter(a => a.name.toLowerCase().includes(q)).slice(0, 5);
  }

  async function readinessRanking() {
    const cats = (await store.catalog()).categories;
    return cats.map(c => { const r = MIQ.readiness(c); return { id: c.id, name: c.name, score: Math.round(r.v), path: r.t }; })
      .sort((a, b) => b.score - a.score);
  }

  return { store, category, params, accountDetail, book, recommendation, approve, findAccount, readinessRanking };
}

module.exports = { createService, HttpError };
