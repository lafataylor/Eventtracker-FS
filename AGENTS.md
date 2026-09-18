# Lafa's List: working in this repository

Read this first. It is written for an AI coding agent (Claude Code, Cursor,
Codex) and for a human opening the repo cold. `CLAUDE.md` imports it.

## What this is

Lafa's List (lafaslist.com) is a live events site for Mexico City, Los
Angeles, Berlin and Bali. Every night it reads the Instagram accounts the owner
follows, has an AI model read each flyer, and turns the result into event
listings. Nobody types events in by hand. Real users, one production server,
no staging environment.

## Layout

```
API/API/                Django 4.2 + DRF project "event_tracker_api" (Python 3.10-3.12)
  event/                Event/Venue/EventMatch models, public feeds, search, duplicates review
  event/dedupe.py       similarity rules; event/series.py: one card per recurring series
  event/management/commands/  detect_duplicates (nightly), purge_past_events (nightly)
  c_admin/              scraper.py (the live ingestion pipeline), extraction.py (AI prompt
                        and parsing), post_ingest.py (city filter), admin endpoints
  c_auth/               users and JWT login (email + usertype 'admin'/'regular')
  event_tracker_api/    settings, urls, middleware (auth gate; public paths listed there)
FE/                     Next.js 13 pages router, hand-rolled Context+useReducer store
  pages/                city pages, admin pages (events, duplicates, accounts, users)
  services/lib/         every API call the site makes
scripts/                dev_setup.sh (local setup), smoke_check.sh (production monitor)
docs/                   plain-language docs and dated plan/execution records
API/ImagesFetcher/      dead code, not called by anything
```

## Commands

```
make setup     # one-time local setup, safe to re-run (scripts/dev_setup.sh)
make test      # API test suite: python manage.py test event c_admin c_auth
make api       # API on http://127.0.0.1:8009 (empty local database)
make fe        # site on http://127.0.0.1:3009 (second terminal)
make check     # site typecheck: npx tsc --noEmit, never grep-filtered
```

The test suite is the contract: over 300 tests, all green on `main`, about
three seconds. Run it before and after every change. Details of the local
setup and its gotchas: `LOCAL_SETUP.md`.

## How the system works, in eight lines

1. Nightly cron logs in as the scraper's own admin user and calls `admin/runScraper/`.
2. Per account, Apify fetches posts newer than the account's last run.
3. Images go to Firebase Storage; the model (OpenAI vision, structured output
   in `c_admin/extraction.py`) returns a list of events per post, with the
   carousel slide each came from, and whether the post is one event, a roundup,
   or a recurring series (expanded to one row per date, three months out).
4. Events outside the four cities are dropped (`c_admin/post_ingest.py`).
5. Rows are upserted on `source_key` (post + slide + ordinal), so a re-scrape
   updates instead of duplicating.
6. `detect_duplicates` runs after the scrape: same-post re-scrapes are hidden
   (`suppressed` + `canonical`), cross-post look-alikes are scored and either
   merged (95+) or queued as `EventMatch` pairs for the owner's review page.
7. `purge_past_events` deletes events 30 days after they happen.
8. Feeds return one card per recurring series (`event/series.py`); rows with
   `is_duplicate`, `suppressed`, or `is_event=False` never reach the public.

## Rules for agents

**Never point anything at production.** The scraper and the admin "add by
Instagram URL" path save events by HTTP-calling the host in
`c_admin/constants.py`, whose default is the live site. `make setup` pins
`EVENT_API_HOST` to this machine in `API/API/.env`; do not remove it. Do not
set real production URLs, server addresses, or database paths anywhere.

**Never commit secrets or data.** `.env`, `.env.local`, service-account
files, and every `.sqlite3`/`.db` file are gitignored; keep it that way. The
repository is public. If a key ends up in a commit, it is compromised.

**Spending money needs a human.** Running the scraper, the extraction, or
"add by URL" with real OpenAI or Apify keys costs credits. The local setup
uses placeholders so those paths fail safely. Ask before wiring real keys.

**Tests first.** Write the failing test, watch it fail, then make it pass.
Every bug fix gets a test that reproduces it. Existing tests document decided
behaviour; a test that "gets in the way" is a conversation, not a deletion.

**Branches and pull requests, never `main` directly.** Deploys are done by
the maintainer from the deploy branches; nothing on a dev machine deploys.

**Do not change without asking:** the live ingestion path in
`c_admin/scraper.py` (`clean_*` functions), the FE store/reducers (works,
fragile, do not refactor mid-task), migrations (the production database has
its own history), and anything under `scripts/server/` or `docs/` that
records what was run on the server.

**Timezones.** `TIME_ZONE` is America/Los_Angeles with `USE_TZ` on. Compare
aware datetimes; use `timezone.localdate()` for "today"; day bounds via
`event.views.local_day_bounds`.

## Conventions

- DRF function views and `APIView` classes; responses through the helpers in
  `event_tracker_api/response.py` (`Success`, `InvalidParameters`, ...).
- Comments explain *why*, with the date and the measurement that motivated
  the change. Keep that habit; it is how the next person avoids undoing a fix.
- Free-text `CharField`s for price, time, city (no normalization at the
  model level). `is_event` is nullable: NULL means never classified, which is
  not the same as False.
- No type hints in most of the API; match the surrounding file.
- Owner-facing text (admin UI, docs for the owner) is plain language.

## Where to read more

- `LOCAL_SETUP.md` for the local stack and why each step exists.
- `docs/SCREENSHARE-PREP.md` for a plain-language tour of the whole system.
- `docs/AI-ASSISTED-DEVELOPMENT.md` for how the owner uses an AI agent here.
- `docs/superpowers/plans/` for dated records of what was built and run.
