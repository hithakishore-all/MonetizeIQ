# Troubleshooting

## Node and the web console

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm ci` fails with "engine" or syntax errors | Node is older than 20 | Install Node 22 (`nvm use` reads `.nvmrc`) |
| `Error: listen EADDRINUSE 127.0.0.1:3000` | Another app uses port 3000 | `npm run offline -- --port=3100`, or set `MONETIZEIQ_PORT` |
| `Live mode needs DATABASE_URL` | `npm start` without a database | Use `npm run offline`, or finish [SETUP_POSTGRES.md](SETUP_POSTGRES.md) step 4 |
| Console shows "Could not load data from the MonetizeIQ API" | Page opened as a file, or the server stopped | Start the server and open the URL it prints |
| Can't reach the console from another device | It binds to 127.0.0.1 by default | Set `MONETIZEIQ_HOST=0.0.0.0` (only on a trusted network) |
| "Copy as CSV" says "Copy blocked" | The browser blocked clipboard access | Use a normal browser tab on `http://127.0.0.1`, not an embedded frame |
| Approvals vanish after a restart | Offline mode keeps decisions in memory | Use live mode for persistence |

## Postgres

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Set DATABASE_ADMIN_URL or DATABASE_URL` | No connection string | [SETUP_POSTGRES.md](SETUP_POSTGRES.md) step 2 |
| `connect ECONNREFUSED` | Postgres isn't running, or wrong host/port | Start Postgres; check the port in the URL |
| `database "monetizeiq" does not exist` | Database not created | `createdb monetizeiq` |
| `permission denied to create role` during `db:setup` | The admin URL isn't allowed to create roles | Use the database owner or superuser for `DATABASE_ADMIN_URL`; on hosted services use the default admin role |
| `password authentication failed for user "monetizeiq_app"` | App role password not set or different | [SETUP_POSTGRES.md](SETUP_POSTGRES.md) step 4 |
| `Database is not seeded` | Tables exist but no data | `npm run db:setup` |
| `permission denied for table accounts` when editing | Expected: the app role is read-only for accounts | Edit `data/catalog.json`, regenerate and rerun `db:setup` |

## Slack

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Slack bot is off (no tokens)` | No tokens in `app/.env` | Expected without Slack; see [SETUP_SLACK.md](SETUP_SLACK.md) |
| `SLACK_BOT_TOKEN ... does not start with xoxb-` | The user token or app token was pasted | Copy the **Bot User OAuth Token** (step 3) |
| `SLACK_APP_TOKEN ... does not start with xapp-` | App-level token missing | [SETUP_SLACK.md](SETUP_SLACK.md) step 5 |
| `/monetize failed with the error "dispatch_failed"` | App not running, or Socket Mode off | Start the app; confirm `socket_mode_enabled: true` in the manifest |
| `An API error occurred: invalid_auth` on start | Token revoked or for another workspace | Reinstall the app and copy fresh tokens |
| Approve says "not mapped to an account owner" | Your Slack ID isn't in `SLACK_APPROVERS` | [SETUP_SLACK.md](SETUP_SLACK.md) step 6 |
| Approve says "Only the account owner ... can approve" | You're mapped to a different owner | Map yourself to the owner shown in the message |
| Mentions get no reply | Bot isn't in the channel | `/invite @MonetizeIQ` |

## Video recorder

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Executable doesn't exist` | Playwright has no browser | `pip install playwright && playwright install chromium`, or set `CHROME_PATH` |
| `ffmpeg failed` | ffmpeg missing | Install ffmpeg (`brew install ffmpeg`) |
