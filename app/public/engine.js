/*
 * MonetizeIQ pricing engine. One file, used by the server (Node) and the web console (browser),
 * so every number on screen, in Slack and in the API comes from the same math.
 *
 * Account shape (normalized by the stores):
 *   { id, categoryId, name, segment, seats, att, s, renews, usageAsOf, ownerId, flag, scen, fresh }
 *   att = agent tasks per month, s = success rate, fresh = age of usage data in days,
 *   flag = null | 'stale' | 'missing'
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MIQ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MODELS = ['seat', 'credit', 'hybrid', 'outcome'];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /** Default scenario parameters for a category. */
  function defaults(C, pricing) {
    return { cmode: 'action', markup: 30, tokp: (pricing && pricing.defaultTokenPrice) || 3, ktokMult: 1,
      price: C.price, shift: 0, win: C.win, fee: 40, cap: 2.5 };
  }

  /** Monthly revenue, cost and outcome funnel for one account under every model. */
  function calc(a, C, P, pricing) {
    const perAction = (pricing && pricing.creditPerAction) || 0.10;
    const byok = (pricing && pricing.byokPerAction) || 0.03;
    const s = clamp(a.s + P.shift / 100, 0.001, 0.98), succ = a.att * s, f = 1 - Math.exp(-P.win / C.tau);
    const excl = succ * C.excl * f, ver = succ - excl, disp = ver * C.disp * Math.exp(-P.win / C.tau), bill = ver - disp;
    const ktok = C.ktok * P.ktokMult, tok = a.att * ktok * 1000 * P.tokp / 1e6, infra = a.att * C.infra, seat = a.seats * C.seatPrice;
    let credit;
    if (P.cmode === 'pass') credit = (tok + infra) * (1 + P.markup / 100);
    else if (P.cmode === 'byok') credit = a.att * C.actions * byok;
    else credit = a.att * C.actions * perAction;
    const outcome = bill * P.price, fee = seat * P.fee / 100;
    const hybrid = Math.min(Math.max(outcome, fee), Math.max(fee, seat * P.cap)), full = tok + infra;
    const missing = a.flag === 'missing';
    return {
      rev: { seat, credit, hybrid: missing ? null : hybrid, outcome: missing ? null : outcome },
      cost: { seat: full, credit: P.cmode === 'byok' ? infra : full, hybrid: full, outcome: full },
      custTok: P.cmode === 'byok' ? tok : 0, succ, excl, disp, bill, tok, infra, fee, s, ktok,
      failedCost: (a.att - bill) * (full / a.att), missing
    };
  }

  /** Book-level totals. Accounts with a missing outcome signal are excluded and counted. */
  function aggregate(accounts, C, P, pricing) {
    const T = { rev: { seat: 0, credit: 0, hybrid: 0, outcome: 0 }, cost: { seat: 0, credit: 0, hybrid: 0, outcome: 0 },
      tok: 0, custTok: 0, att: 0, fee: 0, hybVar: 0, failed: 0, rows: [], excluded: 0 };
    accounts.forEach(a => {
      const c = calc(a, C, P, pricing); T.rows.push({ a, c });
      if (c.missing) { T.excluded++; return; }
      MODELS.forEach(m => { T.rev[m] += c.rev[m]; T.cost[m] += c.cost[m]; });
      T.tok += c.tok; T.custTok += c.custTok; T.att += a.att; T.fee += c.fee; T.hybVar += Math.max(0, c.rev.hybrid - c.fee); T.failed += c.failedCost;
    });
    const cvOut = Math.sqrt(C.vol * C.vol + Math.pow(C.sd / C.s, 2)) * 0.6;
    T.cv = { seat: 0.02, credit: C.vol * 0.6, outcome: cvOut, hybrid: cvOut * (T.rev.hybrid ? T.hybVar / T.rev.hybrid : 0) + 0.01 };
    T.margin = {}; MODELS.forEach(m => { T.margin[m] = T.rev[m] ? (T.rev[m] - T.cost[m]) / T.rev[m] : 0; });
    return T;
  }

  /** Outcome readiness from the four checks: binary, attributable, trusted record, known quickly. */
  function readiness(C) {
    const v = C.ready.reduce((x, y) => x + y, 0) / 4;
    if (v >= 80) return { v, cls: 'good', c: 'var(--good)', t: 'Outcome-ready', d: 'Move this workflow to outcome pricing with a floor.', best: 'outcome' };
    if (v >= 60) return { v, cls: 'warn', c: 'var(--warn)', t: 'Hybrid first', d: 'Platform fee that prepays outcomes, overage above it.', best: 'hybrid' };
    return { v, cls: 'crit', c: 'var(--crit)', t: 'Credits + lift bonus', d: 'Usage credits plus a bonus for lift measured against a holdout.', best: 'credit' };
  }

  /**
   * Recommend a model for one account, with every guardrail applied:
   *  - missing outcome signal  -> withheld (unknown, never $0)
   *  - usage data older than staleDays -> withheld (stale)
   *  - readiness below the gate -> pure outcome is never recommended
   *  - light adopters of an outcome-ready workflow -> hybrid floor
   */
  function recommend(a, C, P, pricing) {
    const gate = (pricing && pricing.readinessGate) || 60, staleDays = (pricing && pricing.staleDays) || 45;
    const r = readiness(C), c = calc(a, C, P, pricing);
    const base = { accountId: a.id, readiness: Math.round(r.v), path: r.t, bills: c.rev };
    if (a.flag === 'missing') return Object.assign(base, { status: 'withheld', code: 'missing_signal', model: null,
      reason: 'No outcome signal is connected, so outcome and hybrid bills are unknown. Connect the ' + C.source.toLowerCase() + ' first.' });
    if (a.fresh > staleDays) return Object.assign(base, { status: 'withheld', code: 'stale_data', model: null,
      reason: 'Usage data is ' + a.fresh + ' days old (limit ' + staleDays + '). Refresh it before quoting this account.' });
    let model = r.best, reason = r.d;
    if (model === 'outcome' && r.v < gate) model = 'hybrid';
    if (model === 'outcome' && c.rev.outcome < c.rev.seat * 0.85) {
      model = 'hybrid'; reason = 'Light adopter: pure outcome would cut the bill ' + Math.round((1 - c.rev.outcome / c.rev.seat) * 100) + '%. A hybrid platform fee keeps it predictable.';
    }
    const delta = c.rev[model] / c.rev.seat - 1;
    return Object.assign(base, { status: 'ok', code: 'recommended', model, reason, delta,
      gateBlocksOutcome: r.v < gate });
  }

  /** Outcome lab: value created by the AI, the vendor's fee and what the customer keeps. */
  function labCalc(C, st) {
    const parts = C.lab.drivers.map((d, i) => {
      const v = st.d[i];
      const diff = d.kind === 'pct' ? (d.lower ? (v.base - v.ai) : (v.ai - v.base)) / 100 : (v.base - v.ai);
      const units = Math.max(0, v.vol * diff);
      return { units, value: units * v.unit, out: d.out };
    });
    const gross = parts.reduce((x, p) => x + p.value, 0), value = gross * st.attr / 100, fee = value * st.share / 100;
    return { parts, gross, value, fee, keep: value - fee, roi: fee ? value / fee : 0,
      perUnit: parts[0].units ? fee * (parts[0].value / (gross || 1)) / parts[0].units : 0 };
  }
  function labDefaults(C) {
    return { attr: C.lab.attr, share: C.lab.share, d: C.lab.drivers.map(d => ({ vol: d.vol[1], base: d.base[1], ai: d.ai[1], unit: d.unit[1] })) };
  }

  /** Fill a category's profile template, e.g. "{att} conversations/mo · {seats} support agents". */
  function profile(C, a) {
    const n = x => Math.round(x).toLocaleString('en-US'), h = Math.max(1, Math.round(a.seats / 25));
    return C.profile.replace('{att}', n(a.att)).replace('{seats}', n(a.seats)).replace('{employees}', n(a.seats * 42))
      .replace('{hospitals}', h + ' hospital' + (h > 1 ? 's' : ''));
  }

  return { MODELS, defaults, calc, aggregate, readiness, recommend, labCalc, labDefaults, profile, clamp };
});
