# Set up the Slack bot

About 10 minutes. You need a Slack workspace where you're allowed to install apps (a free workspace you create works). The bot uses Socket Mode, so you don't need a public URL. It works in offline and live mode.

## 1. Create the app from the manifest

1. Go to https://api.slack.com/apps and click **Create New App → From a manifest**.
2. Pick your workspace.
3. Paste the contents of `app/slack-manifest.yml` (YAML tab) and click **Next → Create**.

## 2. Install it

On the app's **Install App** page, click **Install to Workspace** and **Allow**.

## 3. Copy the bot token

Still on **Install App** (or **OAuth & Permissions**), copy the **Bot User OAuth Token**. It starts with `xoxb-`.

## 4. Put the bot token in app/.env

If you haven't yet: `cd app && cp .env.example .env`. Open `app/.env` and paste it after `SLACK_BOT_TOKEN=`.

On a Mac you can avoid typing it: copy the token, then run

```bash
printf 'SLACK_BOT_TOKEN=%s\n' "$(pbpaste)" >> .env
```

and delete the empty `SLACK_BOT_TOKEN=` line.

## 5. Create the app-level token

1. Open **Basic Information → App-Level Tokens → Generate Token and Scopes**.
2. Name it `socket`, add the scope `connections:write`, click **Generate**.
3. Copy the token (starts with `xapp-`) into `app/.env` after `SLACK_APP_TOKEN=` (or `printf 'SLACK_APP_TOKEN=%s\n' "$(pbpaste)" >> .env`).

## 6. Choose who can approve

Approvals are owner-only. Map your Slack user ID to one of the fictional owners. To find your ID: click your profile picture in Slack → **Profile** → **⋮** → **Copy member ID**.

```
SLACK_APPROVERS=U01ABCDEF=riley
```

Riley Chen owns all ten scenario accounts, so mapping yourself to `riley` lets you approve them. Owners: `riley`, `jordan`, `priya`, `sam`.

## 7. Start the app

```bash
npm run offline     # or: npm start for live mode
```

You should see `Slack bot connected` at the end of the start line.

## 8. Try it

In any channel:

| Type | Expect |
| --- | --- |
| `/monetize help` | The command list |
| `/monetize ready` | Categories ranked by outcome readiness |
| `/monetize Ulvane Home` | Recommendation, bills by model and an **Approve** button |
| Click **Approve** | "Approved ... Decision #1 recorded. Billing is unchanged." (only if you're mapped to the owner) |
| `/monetize Estrova Fiber` | Recommendation withheld (stale data), no Approve button |
| `/monetize Delmora Pharma` | Withheld: no outcome signal, outcome bill shown as unknown |
| `@MonetizeIQ Halvero Software` | Answer in a thread: credits plus a lift bonus, outcome blocked by the readiness gate |

To use mentions, invite the bot to the channel first: `/invite @MonetizeIQ`.

Problems? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#slack).
