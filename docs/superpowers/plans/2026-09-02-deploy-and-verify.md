# Deploy the backlog, prove it on production, then finish the city rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get four finished, twice-reviewed pieces of work onto production in the next window, prove each one on production rather than assuming, and then close the last owner request.

**Where this starts:** everything below is written, tested and merged to `main`, and **none of it is deployed**. The 20:30 UTC window closed mid-session and preflight correctly refused. Nothing here is speculative work; it is a deploy queue plus its verification.

**Architecture:** One API deploy, one FE deploy, one attended dedupe run, then a production smoke check. Task 4 (served-city filter) is separate because it is the only item still gated on a decision.

**Tech Stack:** Django + rapidfuzz on EC2/SQLite, Next.js 13 pages-router, nginx, pm2, cron.

## Global Constraints
- Mutation window **03:00–20:30 UTC**; `/home/ubuntu/misc/preflight.sh` before every server change; never stop the instance.
- `server-api` from `HEAD:API/API`, `server-fe` from `HEAD:FE` via `git commit-tree`; verify the pushed tree equals the local one before deploying.
- `deploy_fe.sh` CONSUMES `/home/ubuntu/deploy-staging-fe`. Recreate it each time: clone `server-fe`, copy `.env.local` from the live FE, `export PATH=$HOME/.nvm/versions/node/v20.14.0/bin:$PATH`, `npm install`, then `npm run build > build.log 2>&1 && echo "=== done" >> build.log`.
- Full unfiltered verification only — whole test suite, whole `tsc`, whole build. Never grep-filter a typecheck, and never read `$?` through a pipe.
- Dedupe rule of the house: a false "distinct" costs a review, a false "redundant" hides a real event.
- Nothing hides on production before a `--dry-run` prints the counts.
- Prod management commands need `OPENAI_API_KEY=unused-by-this-command` and the venv at `/home/ubuntu/EventTracker-API/venv/bin/python` (outside the API dir).

---

### Task 1: deploy the API (dedupe clique guard + client-error endpoint)

**What ships:** the component-based merge decision, the `clientError` endpoint and its logging, the auth exemption, `order_by('id')` on the fuzzy scan.

- [ ] **Step 1: preflight.** `ssh … /home/ubuntu/misc/preflight.sh; echo RC=$?` — must print `PREFLIGHT PASSED` and RC=0. If it refuses, stop; that guard was repaired for a reason.
- [ ] **Step 2: sync and dry-run.**
```bash
API_TREE=$(git rev-parse HEAD:API/API)
API_COMMIT=$(git commit-tree $API_TREE -p origin/server-api -m "Clique guard + client error endpoint")
git push origin $API_COMMIT:server-api
git fetch origin server-api -q
[ "$(git rev-parse origin/server-api^{tree})" = "$API_TREE" ] || exit 1
ssh … "cd /home/ubuntu/deploy-rehearsal/api && git fetch origin server-api -q \
  && git reset --hard origin/server-api -q && ls manage.py \
  && /home/ubuntu/misc/deploy_api.sh --dry-run"
```
Expect exactly: `event/dedupe.py`, `event/management/commands/detect_duplicates.py`, `event/views.py`, `event/urls.py`, `event/test_*.py`, `event_tracker_api/middleware.py`, `event_tracker_api/settings.py`. **If `c_admin/extraction.py` or `c_admin/post_ingest.py` appear, STOP** — the served-city filter has leaked onto `main` and must not ship unvalidated (this exact thing happened on 2026-09-01 and was caught by reading the dry-run).
- [ ] **Step 3: deploy.** `deploy_api.sh`. Confirm `No migrations to apply` (this work adds no schema), gunicorn `active`, `DEBUG = False`, and record the events/suppressed/EventMatch counts it prints.
- [ ] **Step 4: prove the endpoint on production**, then confirm it landed:
```bash
curl -s -X POST https://eventtrackerapi.lafaslist.com/v1/event/clientError/ \
  -H 'Content-Type: application/json' \
  -d '{"message":"deploy verification","path":"/deploy-check"}'
ssh … "tail -2 /home/ubuntu/EventTracker-API/API/logs/client_errors.log"
```
Expect `{"recorded": true}` and a **timestamped** line naming `/deploy-check`. If the file does not exist, the logging config did not take — check that `logs/` is writable by the gunicorn user before assuming the code is wrong.

### Task 2: deploy the FE (null-safety types + ErrorBoundary)

- [ ] **Step 1: sync `server-fe`**, verify the tree matches, then recreate the staging clone and build it per the Global Constraints. The build must end `=== done` or `deploy_fe.sh` will refuse.
- [ ] **Step 2:** `deploy_fe.sh`; expect pm2 `online` and the verifier's two 308s.
- [ ] **Step 3: verify as a visitor, not with curl.** Walk `/`, each of the four cities, `/es`, `/favorites`; open each filter dropdown; search `hiphop`, `hip-hop`, `hip hop` and a handle; open an event. Assert the body never contains `Application error` and `[data-crashed]` is absent. curl cannot see this class of bug — that is the entire lesson of 2026-09-01.
- [ ] **Step 4: run the smoke check against production**: `./scripts/smoke_check.sh` → expect rc=0 and `ok: all 5 pages render with content`.

### Task 3: the attended dedupe run — the owner's four cards

- [ ] **Step 1: dry-run first and compare to the last recorded numbers** (988 merged / 1,720 queued before today's guard):
```bash
ssh … "cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=unused-by-this-command \
  /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates \
  --fuzzy --auto-merge-threshold 95 --dry-run" | tail -4
```
The line now reports merges **split** by score and by anchor. A few hundred anchor merges is expected. **STOP and investigate if anchor merges exceed ~600**, or if score-based merges move at all — the guard must not touch titled pairs.
- [ ] **Step 2: run it attended** (same command without `--dry-run`).
- [ ] **Step 3: invariants — all three must hold.**
```python
Event.objects.filter(suppressed=True, canonical__isnull=True).count()      # 0
Event.objects.filter(suppressed=True, canonical__suppressed=True).count()  # 0
# and no titled event hidden behind an untitled one:
Event.objects.filter(suppressed=True).exclude(name=None).exclude(name='') \
     .filter(canonical__name__isnull=True).count()                         # 0
```
- [ ] **Step 4: the owner's actual complaint.** Of ids 73653 / 75874 / 77107 / 77684, exactly one must remain visible, and it must be the most complete. Then load `https://lafaslist.com/mexico-city/` and confirm the four `adiosclosetbazar` Sep-4 cards are now one. **This is the acceptance test** — the counts do not matter if he still sees four cards.
- [ ] **Step 5: spot-check three merges for wrongness**, in the admin "Hidden as duplicates" scope: each hidden row must name a keeper that is plainly the same event. If any pairs a 5pm listing with a 10pm one, the time check is not firing — revert the run by restoring `suppressed=False, canonical=None` for rows suppressed in that window and stop.
- [ ] **Step 6:** confirm the nightly cron line still reads `--exact --fuzzy --auto-merge-threshold 95` and that `logs/dedupe.log` shows the next run using the new split reporting.

### Task 4: served-city filter — the last owner request

Owner, 2026-09-01: *"when one post grabs events from a whole tour with other cities I would like to just drop them unless they are cities that are currently on my list."* Built and tested on `feat/served-city-filter` (commit 7e93b54), deliberately kept OFF `main`.

**The gate: the metro classification has never faced the real model.** A city-name allowlist was measured and rejected — it would have deleted ~146 real events whose city is a neighbourhood (Roma Norte, Condesa, Seminyak, Canggu, Neukölln, Hollywood, DTLA).

**This costs money (~3 OpenAI extraction calls) and needs Zain's go-ahead per CLAUDE.md.**

- [ ] **Step 1: validate locally, never against production.** Run the local API on the local DB copy with `EVENT_API_HOST` pointing at localhost — **without it the manual add writes to PRODUCTION** — then add three posts by URL and read the `[METRO]` lines:
  - a real multi-city tour post (Molchat Doma) → non-served stops classified `OTHER` and dropped, the served stop kept;
  - a plain local post (any `bar_oriente` event) → metro is the served city, nothing dropped;
  - **a neighbourhood-addressed post** (Roma Norte / Seminyak / Neukölln) → metro is the PARENT CITY, not `OTHER`.
- [ ] **Step 2:** if any neighbourhood post returns `OTHER`, do not ship. Tighten the prompt's neighbourhood list and re-run; that failure mode silently deletes real events.
- [ ] **Step 3:** on success merge to `main`, full suite, sync `server-api`, dry-run, deploy in-window.
- [ ] **Step 4: morning-after check.** `grep '\[METRO\]' logs/*.log` for the night's drops and read every dropped title. If a served-city event was dropped, revert the deploy first and debug second.

### Task 5: make the monitor actually run

The smoke check is worthless sitting in the repo.

- [ ] **Step 1:** decide where it runs. It needs `agent-browser`, which is on the dev machine, not the server — so a local cron (`0 * * * *`) is the pragmatic answer; the script already exits 2 rather than 0 when the browser is missing, so a wrong host announces itself instead of pretending to pass.
- [ ] **Step 2:** install the cron line, redirecting to a log.
- [ ] **Step 3: prove it alerts.** Point it at a port with nothing listening and confirm rc=1 and a `NAVIGATION_FAILED` line. A monitor nobody has seen fail is not a monitor.
- [ ] **Step 4:** tell Zain how it surfaces — what he should look at, and that rc=2 means "did not verify" rather than "healthy".

## Execution record
- 2026-09-01 (late): plan written. Tasks 1–3 are a deploy queue for work already on `main`; Task 4 is the only item needing a decision; Task 5 is what stops the client being the monitoring system.

## Execution record (2026-09-02, window open)
- **Tasks 1 + 2 DONE.** API and FE deployed after preflight (idle 4h51m). The
  dry-run listed only the expected files — no `c_admin/extraction.py`, so the
  unvalidated city filter correctly stayed off. Verified on production: the
  clientError endpoint returns `{"recorded": true}` and writes a TIMESTAMPED
  line; `smoke_check.sh` returns rc=0 on all five pages.
- **Task 3 DONE — the owner's screenshot is fixed.** Dry-run: 176 merges, all
  by venue anchor, **0 by score** (proving the guard leaves titled pairs
  alone), well under the 600 stop-threshold. Ran attended. All four
  `adiosclosetbazar` Sep-4 rows (73653, 75874, 77107, 77684) now collapse to
  one keeper (78780).
- **Invariants: my run is clean; three PRE-EXISTING issues found.** The first
  invariant query was itself wrong — in Django `canonical__name__isnull=True`
  across a nullable FK also matches rows with NO canonical, inflating "titled
  behind untitled" from 7 to 37. Corrected numbers, all predating today:
  * 42 rows suppressed with no canonical — all from Jan/Feb 2025, all still
    carrying `duplicate_link`, i.e. an older code path.
  * 7 titled rows hidden behind an untitled keeper — **0 caused by the venue
    anchor**; all are `exact_link` score-100 collapses, and 6 have an UNDATED
    keeper, which the anchor cannot produce (it requires equal non-null dates).
  * 1 canonical chain (69800 -> 69802 -> 70335): the exact pass linked 69800
    to 69802 after a score-100 fuzzy merge had already suppressed 69802. The
    final keeper is visible, so the harm is that the recovery tab would name a
    hidden row as "kept instead". Worth fixing; not urgent.
- **Owner round 3 (2026-09-02) — built, not yet deployed** (commits 9a63bf3,
  7958f9d). Measured first: 1,532 of 1,676 pending pairs (91%) were pairs
  where BOTH events had already happened, and 11 non-events were servable by
  the date feed. The queue now hides dead pairs and sorts chronologically
  (undated last); `date_events` and `date_range_events` now apply the same
  visibility rules as search. Proved `.exclude(is_event=False)` keeps NULL
  rows — had it not, every unclassified event would have vanished from the
  site. 191 tests. Local queue 49 -> 5 pairs; 2026-09-11 feed 6 -> 5 rows with
  the placeholder gone.
