# Changelog

## 1.0.0 (2026-11-18)

- Market map: 4 meters (effort, work completed, outcome event, outcome lift) and 12 AI categories with playbooks, readiness scores and a readiness map.
- Pricing cockpit: seat, credit (per action, token pass-through, customer's own key), hybrid and outcome pricing for 96 fictional accounts per category; revenue bridge, forecast ranges, token-economics curve, book heatmap, account audit trail, Ask the pane.
- Guardrails: readiness gate, stale-data and missing-signal checks, light-adopter hybrid floor.
- Owner-only, idempotent approvals with an audit log, in the web console and Slack.
- Outcome lab for value created, vendor fee and evidence needed per category.
- Postgres store with governed views and a least-privilege role; offline snapshot mode.
- Slack bot (Socket Mode) with `/monetize` and an Approve button.
- End-to-end smoke tests and a captioned walkthrough recorder.
