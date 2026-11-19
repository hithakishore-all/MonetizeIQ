# Security

## Reporting a problem

Please open a GitHub issue without sensitive details and ask for a private contact, or use GitHub's private vulnerability reporting on this repository.

## What this project does to stay safe

- **Synthetic data only.** No real customers, people or prices. Emails use the reserved `.example` domain.
- **No secrets in the repo.** Tokens and passwords live only in `app/.env` (git-ignored) or the environment.
- **Least privilege.** The running app connects as `monetizeiq_app`, which can read the catalog and governed views and can only insert decisions and audit rows.
- **Human approval.** Only an account's owner can approve a recommendation, and approval records a decision. It never changes billing or contacts anyone.
- **Append-only evidence.** Outcome events are never edited; disputes add a line.
- **Local by default.** The web console binds to `127.0.0.1`. The Slack bot uses Socket Mode, so no public endpoint is exposed.
- **Input limits.** JSON bodies are capped at 20 KB, parameters are range-checked, and bad input gets a 4xx response.
