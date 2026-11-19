-- Governed views. The app reads accounts and evidence only through these.

-- Accounts with their owner and how old their usage data is, measured from the pinned demo date.
CREATE OR REPLACE VIEW monetizeiq.v_account_book AS
SELECT a.id, a.category_id, a.name, a.segment, a.seats, a.tasks_per_month, a.success_rate, a.renews,
       a.usage_as_of, a.owner_id, o.name AS owner_name, o.email AS owner_email,
       a.data_flag, a.scenario,
       ((SELECT value::date FROM monetizeiq.app_config WHERE key = 'demo_today') - a.usage_as_of) AS data_age_days
FROM monetizeiq.accounts a
JOIN monetizeiq.owners o ON o.id = a.owner_id;

-- Every outcome event with its source record, date and evidence ID, so any billed line can be traced.
CREATE OR REPLACE VIEW monetizeiq.v_outcome_evidence AS
SELECT e.event_id, e.account_id, a.name AS account_name, e.category_id, e.source_record, e.occurred_at,
       e.tokens, e.cost_to_serve, e.status, e.reason, e.rule_version, e.billed, e.evidence_id
FROM monetizeiq.outcome_events e
JOIN monetizeiq.accounts a ON a.id = e.account_id;
