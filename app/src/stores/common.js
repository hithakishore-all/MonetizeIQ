'use strict';
/** Helpers shared by the offline and Postgres stores so both return identical shapes. */

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(String(fromIso).slice(0, 10) + 'T00:00:00Z')) / 864e5);
}

/** Turn a stored account row into the engine's account shape. */
function normalizeAccount(row, demoToday) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    segment: row.segment,
    seats: Number(row.seats),
    att: Number(row.tasks_per_month),
    s: Number(row.success_rate),
    renews: row.renews,
    usageAsOf: String(row.usage_as_of).slice(0, 10),
    ownerId: row.owner_id,
    flag: row.data_flag || null,
    scen: row.scenario ? Number(row.scenario) : null,
    fresh: row.data_age_days != null ? Number(row.data_age_days) : daysBetween(row.usage_as_of, demoToday)
  };
}

function normalizeEvent(row) {
  return {
    eventId: row.event_id,
    accountId: row.account_id,
    sourceRecord: row.source_record,
    occurredAt: new Date(row.occurred_at).toISOString(),
    tokens: Number(row.tokens),
    costToServe: Number(row.cost_to_serve),
    status: row.status,
    reason: row.reason || '',
    ruleVersion: row.rule_version,
    billed: Number(row.billed),
    evidenceId: row.evidence_id
  };
}

module.exports = { normalizeAccount, normalizeEvent, daysBetween };
