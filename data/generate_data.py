#!/usr/bin/env python3
"""Generate every MonetizeIQ seed file from data/catalog.json.

Writes, deterministically (same input -> byte-identical output):
  data/seed/accounts.csv         one row per fictional account
  data/seed/outcome_events.csv   recent outcome events per account (the audit trail)
  db/04_seed.sql                 the same data as SQL inserts for Postgres
  app/fixtures/snapshot.json     the same data for offline mode

All companies, people and numbers are fictional. Emails use the .example domain.
Run:  python3 data/generate_data.py
"""
import csv
import io
import json
import math
import os
import random
import zlib
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "data", "catalog.json")
SEED_DIR = os.path.join(ROOT, "data", "seed")
SQL_OUT = os.path.join(ROOT, "db", "04_seed.sql")
FIXTURE_OUT = os.path.join(ROOT, "app", "fixtures", "snapshot.json")

ROOTS = ["Arvella", "Brekwell", "Corvane", "Delmora", "Estrova", "Fenwyck", "Galvane", "Halvero",
         "Istera", "Jorvell", "Kestane", "Lowmere", "Marvane", "Norvane", "Orlesse", "Pellwyn",
         "Quillon", "Ravenmoor", "Solvane", "Tarrow", "Ulvane", "Vardell", "Wexmoor", "Yarrowby"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
OWNERS = [
    {"id": "riley", "name": "Riley Chen", "email": "riley.chen@monetizeiq.example", "role": "Head of Pricing"},
    {"id": "jordan", "name": "Jordan Alvarez", "email": "jordan.alvarez@monetizeiq.example", "role": "Enterprise AE"},
    {"id": "priya", "name": "Priya Raman", "email": "priya.raman@monetizeiq.example", "role": "Account Director"},
    {"id": "sam", "name": "Sam Okafor", "email": "sam.okafor@monetizeiq.example", "role": "Deal Desk Lead"},
]
PLAN = [("Enterprise", 20, 150, 900), ("Mid-market", 44, 30, 150), ("SMB", 32, 5, 30)]
EVENTS_PER_ACCOUNT = 8
TOKEN_PRICE = 3.0  # $ per 1M tokens used for stored cost_to_serve


def seeded(name):
    return random.Random(zlib.crc32(name.encode("utf-8")))


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def build(catalog):
    today = date.fromisoformat(catalog["demoToday"])
    scen_names = {s["name"] for s in catalog["scenarios"]}
    accounts, events = [], []
    for c in catalog["categories"]:
        r = seeded(c["id"])
        names = [f"{root} {suf}" for root in ROOTS for suf in c["suffix"] if f"{root} {suf}" not in scen_names]
        r.shuffle(names)
        rows, k = [], 0
        for seg, n, lo, hi in PLAN:
            for _ in range(n):
                seats = max(1, round((lo + (hi - lo) * (r.random() ** 1.6)) * c["scale"]))
                u = 0.45 + r.random() * 1.1
                att = max(1, round(seats * c["perSeat"] * u))
                s = clamp(c["s"] * (0.72 + 0.56 * r.random()), 0.002, 0.97)
                rows.append({
                    "id": f"{c['id']}-{k + 1:03d}", "category_id": c["id"], "name": names[k], "segment": seg,
                    "seats": seats, "tasks_per_month": att, "success_rate": round(s, 4),
                    "renews": f"{MONTHS[int(r.random() * 12)]} 2027",
                    "usage_as_of": (today - timedelta(days=1 + int(r.random() * 9))).isoformat(),
                    "owner_id": OWNERS[int(r.random() * len(OWNERS))]["id"],
                    "data_flag": "", "scenario": "",
                })
                k += 1
        for sc in [x for x in catalog["scenarios"] if x["cat"] == c["id"]]:
            a = next(x for x in rows if x["segment"] == sc["seg"] and not x["scenario"])
            a.update({"name": sc["name"], "seats": sc["seats"], "tasks_per_month": round(sc["seats"] * c["perSeat"] * sc["u"]),
                      "success_rate": sc["s"], "scenario": str(sc["n"]), "data_flag": sc.get("flag") or "",
                      "owner_id": "riley",
                      "usage_as_of": (today - timedelta(days=52 if sc.get("flag") == "stale" else 2)).isoformat()})
        accounts.extend(rows)
        events.extend(make_events(c, rows, today))
    return accounts, events


def make_events(c, rows, today):
    out = []
    win, tau = c["win"], c["tau"]
    f = 1 - math.exp(-win / tau)
    for a in rows:
        r = seeded(a["id"] + ":events")
        pe = c["excl"] * f
        pd = (1 - pe) * c["disp"] * math.exp(-win / tau)
        stale = a["data_flag"] == "stale"
        base = datetime(today.year, today.month, today.day, 17, 0, tzinfo=timezone.utc)
        if stale:
            base -= timedelta(days=52)
        t = base
        gap_h = max(0.05, min(24.0, 2000 / a["tasks_per_month"]))
        for i in range(EVENTS_PER_ACCOUNT):
            t -= timedelta(seconds=round((1 + r.random() * 9) * 3600 * gap_h))
            tokens = round(c["ktok"] * 1000 * (0.55 + r.random() * 1.3))
            cost = tokens * TOKEN_PRICE / 1e6 + c["infra"]
            x = r.random()
            if a["data_flag"] == "missing":
                status = "no_signal"
            elif i < 2 and win > 0 and not stale:
                status = "pending"
            elif x < pe:
                status = "excluded"
            elif x < pe + pd:
                status = "disputed"
            else:
                status = "verified"
            src = f"{c['prefix']}-{100000 + int(r.random() * 899999)}"
            out.append({
                "event_id": f"{a['id']}-e{i + 1:02d}", "account_id": a["id"], "category_id": c["id"],
                "source_record": src, "occurred_at": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "tokens": tokens, "cost_to_serve": round(cost, 4), "status": status,
                "reason": {"excluded": c["exclReason"], "disputed": c["disputeReason"]}.get(status, ""),
                "rule_version": f"{c['prefix'].lower()}-rule v1.{win}",
                "billed": round(c["price"], 2) if status == "verified" else 0,
                "evidence_id": f"{c['prefix']}-EV-{zlib.crc32((a['id'] + src).encode()) % 900000 + 100000}",
            })
    return out


def to_csv(rows, cols):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for row in rows:
        w.writerow({k: row[k] for k in cols})
    return buf.getvalue()


def q(v):
    if v is None or v == "":
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def to_sql(catalog, accounts, events):
    lines = ["-- Generated by data/generate_data.py. Do not edit by hand. All data is fictional.",
             "BEGIN;",
             "TRUNCATE monetizeiq.decisions, monetizeiq.audit_log, monetizeiq.outcome_events, monetizeiq.accounts, monetizeiq.owners, monetizeiq.categories, monetizeiq.app_config RESTART IDENTITY;",
             f"INSERT INTO monetizeiq.app_config (key, value) VALUES ('demo_today', {q(catalog['demoToday'])}), ('catalog_version', {q(str(catalog['version']))}), ('catalog_meta', {q(json.dumps(dict({k: v for k, v in catalog.items() if k != 'categories'}, categoryOrder=[c['id'] for c in catalog['categories']]), ensure_ascii=False))});"]
    for c in catalog["categories"]:
        lines.append(f"INSERT INTO monetizeiq.categories (id, name, family, meter, definition) VALUES ({q(c['id'])}, {q(c['name'])}, {q(c['fam'])}, {q(c['meter'])}, {q(json.dumps(c, ensure_ascii=False))}::jsonb);")
    for o in OWNERS:
        lines.append(f"INSERT INTO monetizeiq.owners (id, name, email, role) VALUES ({q(o['id'])}, {q(o['name'])}, {q(o['email'])}, {q(o['role'])});")
    for a in accounts:
        lines.append("INSERT INTO monetizeiq.accounts (id, category_id, name, segment, seats, tasks_per_month, success_rate, renews, usage_as_of, owner_id, data_flag, scenario) VALUES "
                     f"({q(a['id'])}, {q(a['category_id'])}, {q(a['name'])}, {q(a['segment'])}, {a['seats']}, {a['tasks_per_month']}, {a['success_rate']}, {q(a['renews'])}, {q(a['usage_as_of'])}, {q(a['owner_id'])}, {q(a['data_flag'])}, {q(a['scenario'])});")
    for e in events:
        lines.append("INSERT INTO monetizeiq.outcome_events (event_id, account_id, category_id, source_record, occurred_at, tokens, cost_to_serve, status, reason, rule_version, billed, evidence_id) VALUES "
                     f"({q(e['event_id'])}, {q(e['account_id'])}, {q(e['category_id'])}, {q(e['source_record'])}, {q(e['occurred_at'])}, {e['tokens']}, {e['cost_to_serve']}, {q(e['status'])}, {q(e['reason'])}, {q(e['rule_version'])}, {e['billed']}, {q(e['evidence_id'])});")
    lines += ["COMMIT;", ""]
    return "\n".join(lines)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def main():
    with open(CATALOG, encoding="utf-8") as fh:
        catalog = json.load(fh)
    accounts, events = build(catalog)
    acols = ["id", "category_id", "name", "segment", "seats", "tasks_per_month", "success_rate", "renews", "usage_as_of", "owner_id", "data_flag", "scenario"]
    ecols = ["event_id", "account_id", "category_id", "source_record", "occurred_at", "tokens", "cost_to_serve", "status", "reason", "rule_version", "billed", "evidence_id"]
    write(os.path.join(SEED_DIR, "accounts.csv"), to_csv(accounts, acols))
    write(os.path.join(SEED_DIR, "outcome_events.csv"), to_csv(events, ecols))
    write(SQL_OUT, to_sql(catalog, accounts, events))
    snap = {"generatedFrom": "data/generate_data.py", "config": {"demo_today": catalog["demoToday"]},
            "catalog": catalog, "owners": OWNERS, "accounts": accounts, "events": events}
    write(FIXTURE_OUT, json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"accounts: {len(accounts)}, outcome events: {len(events)}")


if __name__ == "__main__":
    main()
