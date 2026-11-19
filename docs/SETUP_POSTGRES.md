# Set up Postgres (live mode)

About 10 minutes. You need Postgres 14 or newer and Node.js 20 or newer. Offline mode needs none of this.

## 1. Get a Postgres database

Pick one:

- **On your Mac:** install [Postgres.app](https://postgresapp.com) and start it, or run `brew install postgresql@16 && brew services start postgresql@16`.
- **Free hosted:** create a free project on Neon or Supabase and copy its connection string.

Then create a database called `monetizeiq`:

```bash
createdb monetizeiq
```

(Hosted services usually give you a database already; you can use that one.)

## 2. Tell the setup script how to connect as an admin

In the `app` folder, copy the example settings file:

```bash
cd app
cp .env.example .env
```

Open `app/.env` and set `DATABASE_ADMIN_URL` to a role that can create schemas and roles. For a local install this is usually:

```
DATABASE_ADMIN_URL=postgresql://<your-mac-username>@localhost:5432/monetizeiq
```

For a hosted service, paste the connection string it gave you.

## 3. Create the tables and load the demo data

```bash
npm ci
npm run db:setup
```

You should see each of `01_setup.sql` to `05_grants.sql` followed by `done`, then `ready: 1152 accounts, 9216 outcome events.` It is safe to run again; it rebuilds the tables.

## 4. Give the app its own least-privilege login

The setup created a role called `monetizeiq_app` that can read the data and write only decisions and audit entries. It has no password yet. Choose one and set it yourself (it never goes in the repo):

```bash
psql "<your DATABASE_ADMIN_URL>" -c "ALTER ROLE monetizeiq_app LOGIN PASSWORD 'choose-a-password'"
```

Then in `app/.env` set:

```
DATABASE_URL=postgresql://monetizeiq_app:choose-a-password@localhost:5432/monetizeiq
```

## 5. Start live mode

```bash
npm start
```

You should see `live mode · web console at http://127.0.0.1:3000`. Open it, go to **Scenarios**, open scenario 1 and approve as Riley Chen. Then check the decision landed:

```bash
curl http://127.0.0.1:3000/api/decisions
```

## Regenerating the data

`data/catalog.json` is the source of truth. After changing it:

```bash
python3 data/generate_data.py      # from the repo root
cd app && npm run db:setup
```

Problems? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#postgres).
