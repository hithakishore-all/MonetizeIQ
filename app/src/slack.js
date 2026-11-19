'use strict';
/**
 * Slack bot (Bolt, Socket Mode: no public URL needed).
 *   /monetize <account name>   recommendation, bills by model, Approve button (owner only)
 *   /monetize ready            categories ranked by outcome readiness
 *   /monetize help
 * Approving records a decision only. It never changes billing and never messages customers.
 */
const { App, LogLevel } = require('@slack/bolt');

const money = v => v == null ? 'unknown' : '$' + Math.round(v).toLocaleString('en-US');
const NAMES = { seat: 'Seat', credit: 'Credit', hybrid: 'Hybrid', outcome: 'Outcome' };

function accountBlocks(d) {
  const r = d.recommendation, a = d.account;
  const bills = ['seat', 'credit', 'hybrid', 'outcome'].map(m => `${NAMES[m]}: *${money(d.bills[m])}*/mo`).join('   ');
  const head = r.status === 'ok'
    ? `*Recommended: ${NAMES[r.model]}* (${r.path}, readiness ${r.readiness})\n${r.reason}`
    : `*Recommendation withheld* (${r.code.replace('_', ' ')})\n${r.reason}`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: a.name } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${a.segment} · ${d.profile} · owner ${d.owner ? d.owner.name : a.ownerId} · data ${a.fresh} days old` }] },
    { type: 'section', text: { type: 'mrkdwn', text: head } },
    { type: 'section', text: { type: 'mrkdwn', text: bills } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Synthetic demo data. Approving records a decision only; billing is unchanged.' }] }
  ];
  if (r.status === 'ok') {
    blocks.push({ type: 'actions', elements: [{ type: 'button', style: 'primary', action_id: 'miq_approve', text: { type: 'plain_text', text: `Approve ${NAMES[r.model]}` }, value: `${a.id}|${r.model}` }] });
  }
  return blocks;
}

function createSlackBot(service, cfg) {
  const app = new App({ token: cfg.slack.botToken, appToken: cfg.slack.appToken, socketMode: true, logLevel: LogLevel.WARN });

  async function handle(text, userId) {
    const t = String(text || '').trim();
    if (!t || t === 'help') {
      return { text: 'MonetizeIQ: `/monetize <account name>` for a pricing recommendation, `/monetize ready` for outcome readiness by category.' };
    }
    if (t === 'ready') {
      const rows = await service.readinessRanking();
      return { text: '*Outcome readiness by AI category*\n' + rows.map((r, i) => `${i + 1}. ${r.name}: ${r.score} (${r.path})`).join('\n') };
    }
    const hits = await service.findAccount(t);
    if (!hits.length) return { text: `No account matches "${t}". Try a name from the Scenarios tab, for example Ulvane Home.` };
    if (hits.length > 1 && hits[0].name.toLowerCase() !== t.toLowerCase()) return { text: 'Several accounts match:\n' + hits.map(h => `• ${h.name}`).join('\n') };
    const d = await service.recommendation(hits[0].id, 'slack:' + userId);
    return { text: `${d.account.name}: pricing recommendation`, blocks: accountBlocks(d) };
  }

  app.command('/monetize', async ({ command, ack, respond }) => {
    await ack();
    try { await respond(Object.assign({ response_type: 'ephemeral' }, await handle(command.text, command.user_id))); }
    catch (e) { await respond({ response_type: 'ephemeral', text: 'Sorry, that failed: ' + e.message }); }
  });

  app.event('app_mention', async ({ event, say }) => {
    const text = String(event.text || '').replace(/<@[^>]+>/g, '').trim();
    try { await say(Object.assign({ thread_ts: event.ts }, await handle(text, event.user))); }
    catch (e) { await say({ thread_ts: event.ts, text: 'Sorry, that failed: ' + e.message }); }
  });

  app.action('miq_approve', async ({ ack, body, action, respond }) => {
    await ack();
    const [accountId, model] = String(action.value).split('|');
    const approverId = cfg.slack.approvers[body.user.id];
    if (!approverId) {
      await respond({ response_type: 'ephemeral', replace_original: false, text: 'Your Slack user is not mapped to an account owner, so you cannot approve. Ask an admin to add you to SLACK_APPROVERS.' });
      return;
    }
    try {
      const out = await service.approve({ accountId, model, approverId }, 'slack:' + body.user.id);
      await respond({ response_type: 'ephemeral', replace_original: false, text: `${out.created ? 'Approved' : 'Already approved'}: ${NAMES[model]} for ${accountId}. Decision #${out.decision.id} recorded. Billing is unchanged.` });
    } catch (e) {
      await respond({ response_type: 'ephemeral', replace_original: false, text: e.message });
    }
  });

  return {
    async start() { await app.start(); },
    async stop() { await app.stop(); }
  };
}

module.exports = { createSlackBot, accountBlocks };
