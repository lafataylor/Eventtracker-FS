# FE null-safety QA + city filter + auto-merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the next null-data outage (full FE sweep + prod-data E2E), implement Lafayette's tour-stop rule (drop events extracted for cities not on his list), and turn on the approved fuzzy auto-merge nightly.

**Architecture:** The 2026-09-01 outage = latent FE assumptions (fields never null under the legacy extractor) armed by the structured extractor writing real NULLs (offering 0%→42% null, plus host/promoter/opener). Task 1 audits every FE access of nullable event fields and locks it in with a prod-data browser harness. Task 2 filters non-list cities at the extraction/save boundary (`build_payloads`), never inside the scraping mechanics. Task 3 edits the CRON's `run_dedupe.sh` (the `/home/ubuntu/EventTracker-API/API/` copy — the `misc/` copy is stale and runs nothing).

**Tech Stack:** Next.js 13 pages-router (no FE test infra — verification = tsc + prod-API build + agent-browser walk), Django mgmt commands, EC2 cron.

## Global Constraints
- Mutation window 03:00–20:30 UTC; preflight before server changes; never stop the instance; server-api from `HEAD:API/API`, server-fe from `HEAD:FE` (commit-tree snapshots); full unfiltered `tsc`/build/test-suite verification; deploy_fe.sh needs a fresh `deploy-staging-fe` clone each time (the swap consumes it) with `build.log` ending `=== done`.
- Do not modify the live scraper's `clean_*` scraping mechanics; Task 2 lives in `extraction.py` (`build_payloads`).
- Newly-nullable fields (measured on prod, Aug 31 cohort of 497 rows): offering 210, host 407, promoter 319, opener 480, genres 252, price 394, start_time 211, artist 219, name 50, ticket_link 119. `venue` relation: guard everywhere anyway.

---

### Task 1: FE null-safety sweep + prod-data E2E harness

**Files:**
- Audit + modify: `FE/components/Dashboard/EventCard.tsx` (KNOWN: line ~200 `event.venue.name` / `event.venue.address` unguarded venue), `EventDetails.tsx`, `EventsSection.tsx`, `Filter/Filter.tsx`, `Filter/DashboardFilter.tsx` (fixed in 452c5dd — pattern reference), `SearchBar.tsx`, `pages/index.tsx`, `pages/es.tsx`, `pages/[location-name]/*`, `pages/favorites/*`, ES twins.

- [ ] **Step 1: enumerate every unguarded access.** For each nullable field, grep and record hits that lack `?.` / truthy guard in a scratch checklist:
```bash
cd FE && for f in offering host promoter opener genres price start_time artist name ticket_link; do
  grep -rn "\.$f\." --include='*.tsx' components/ pages/ | grep -v node_modules | grep -v "?\." ;
done
grep -rn "venue\.\(name\|address\|city\|state\|country\)" --include='*.tsx' components/ pages/ | grep -v "venue?\."
```
- [ ] **Step 2: fix each hit** with the minimal guard in the file's existing style (`?.`, `?? ''`, or truthy filter). Never change render output for present values. The DashboardFilter fix (452c5dd) is the pattern: `flatMap(... ?? [])`, `.filter(Boolean)`-before-`.trim()`, `venue?.`.
- [ ] **Step 3: `npx tsc --noEmit` rc=0, full `npm run build` rc=0.**
- [ ] **Step 4: prod-data harness.** Build against the live API and walk every page:
```bash
NEXT_PUBLIC_API_BASE_URL=https://eventtrackerapi.lafaslist.com/v1 npm run build && npx next start -p 3011
# agent-browser: open /, each city, /es twins, favorites, an event details modal,
# search "hiphop" + a handle, open filters (date/price/offerings dropdowns —
# the offerings dropdown is what crashed), check body never contains "Application error".
```
- [ ] **Step 5:** commit to main (`QA: guard nullable event fields across the FE`), sync `server-fe`, fresh staging clone + build + `deploy_fe.sh` in-window, re-walk the five prod pages.

### Task 2: drop extracted events for cities not on the list

Owner (2026-09-01): "just drop them unless they are cities that are currently on my list i.e. Berlin, Bali, Los Angeles, Mexico City".

**Files:**
- Modify: `API/API/c_admin/extraction.py` (`build_payloads`, signature at :295; per-event `city` mapped at :327)
- Test: `API/API/c_admin/test_extraction.py` (extend existing tests for build_payloads if present; else add class)

**Interfaces:** build_payloads consumes `ExtractedEvent.city: Optional[str]`; produces payload dicts — it must simply not emit payloads whose extracted city is a KNOWN other city.

- [ ] **Step 1: failing tests** — tour post fixture: events with city "Berlin", "Paris", "CDMX", None → payloads keep Berlin + CDMX + None, drop Paris; a non-event payload (is_event False) is never dropped for city (it must still mark the post processed).
- [ ] **Step 2: implement** a module-level rule beside the schema:
```python
# Cities the product currently serves. An event extracted with a DIFFERENT
# city is a tour stop the owner asked to drop (2026-09-01): "drop them
# unless they are cities that are currently on my list". An event with NO
# extracted city keeps the account's city as before — only positive
# evidence of elsewhere drops a row.
ACTIVE_CITY_TOKENS = {
    'berlin': 'Berlin',
    'bali': 'Bali', 'denpasar': 'Bali', 'ubud': 'Bali', 'canggu': 'Bali',
    'los angeles': 'Los Angeles', 'la': 'Los Angeles',
    'mexico city': 'Mexico City', 'cdmx': 'Mexico City',
    'ciudad de mexico': 'Mexico City',
}

def city_is_active(city):
    if not city:
        return True          # no evidence of elsewhere
    key = unicodedata.normalize('NFKD', city)
    key = ''.join(c for c in key if not unicodedata.combining(c))
    key = ' '.join(key.lower().split())
    return key in ACTIVE_CITY_TOKENS
```
and in `build_payloads`, before appending an EVENT payload: `if payload.get('is_event') and not city_is_active(event.city): continue` (log the drop with shortcode + city so a wrong drop is diagnosable).
- [ ] **Step 3:** full API suite green; commit; cherry-pick/push main; sync `server-api`; deploy in-window (`deploy_api.sh` dry-run first).
- [ ] **Step 4:** next-morning check: grep the night's log for `[STRUCTURED]` drops; confirm no active-city event was dropped (spot-check 3).

### Task 3: enable fuzzy auto-merge nightly (APPROVED: Lafayette "yes good to run it" + wants it automatic, 2026-09-01)

**Files (server):** `/home/ubuntu/EventTracker-API/API/run_dedupe.sh` (the one crontab runs at 03:37 UTC; currently `--exact` only). Reconcile or delete the stale `/home/ubuntu/misc/run_dedupe.sh`.

- [ ] **Step 1: first run, attended, in-window:**
```bash
cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=unused-by-this-command \
  /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates \
  --fuzzy --auto-merge-threshold 95 2>&1 | tail -4
```
Expected ≈ dry-run: ~988 merged, ~1288 queued (drift from new nights is fine). Record exact numbers.
- [ ] **Step 2: invariants** — suppressed rows all have `canonical` set and no canonical chain (`Event.objects.filter(suppressed=True, canonical__suppressed=True).count() == 0`); site pages still render; Hood Rave cards collapsed (the owner's screenshot case).
- [ ] **Step 3: cron line** — edit the CRON copy: `detect_duplicates --exact` → `detect_duplicates --exact --fuzzy --auto-merge-threshold 95`. Answer Lafayette: yes, from now on it happens automatically every night.
- [ ] **Step 4: tell the owner** the queue now holds ~1300 review pairs and the bulk tools are how to chew through them (suggest 5 minutes/day, not one sitting).

### Task 4: preflight false-positive fix (a manual add's log tail blocked a hotfix deploy during an outage)

**Files (server):** `/home/ubuntu/misc/preflight.sh`

- [ ] **Step 1:** change the newest-log rule: FAIL only when the newest non-"Completed" log row is YOUNGER than the idle threshold (a 12-hour-old "Step Completed" from a manual add is not an in-flight scrape). Keep the existing idle + window + disk checks unchanged.
- [ ] **Step 2:** test: run preflight now (stale Step Completed tail present) → PASS with a warning line; simulate a fresh log row (INSERT via shell into a COPY of the check, not the real Logs) → FAIL.

## Execution record
- 2026-09-01: plan written after the outage (hotfix 452c5dd deployed and verified; site up). Task 3 pre-approved by owner and Zain ("go later"); run it in the next window alongside Task 1's deploy.

## Execution record (2026-09-01 evening)
- **Task 1 DONE + DEPLOYED.** Audit (2 parallel agents) found a SECOND live
  crash the outage had masked: `event.offering.toLowerCase()` in applyFilters
  in all six event-list pages, so one keystroke in the Offerings box unmounted
  the app for any visitor. Reproduced on production before fixing. Also fixed:
  Filter.tsx mapping null venue.address then calling .toLowerCase() (outage's
  exact shape), poster.user string ops (Filter + EventDetails), null
  venue.address breaking the admin State edit, getOptions() splitting null,
  "$NaN" for null price. ROOT CAUSE fixed too: simpleObject.tsx declared the
  fields non-nullable, which is why tsc passed the outage expression; the ten
  frequently-null fields are now `string | null` and the 22 errors that
  surfaced were each a real latent bug, all fixed. tsc rc=0, build rc=0,
  walked every public page + /es + /favorites against the live API, and
  exercised the offering filter. Deployed 19:13 UTC; verified on prod
  (all 5 pages ok; typing AND selecting an offering: no crash, 0 console
  errors). Commit fb641e0, merged to main as 2a79edd.
- **Task 4 DONE.** preflight blocked the outage hotfix over a 12h-old
  "Step Completed" row from a manual add. Rewritten to judge by AGE, not the
  status word. While testing the FAIL path I found my first patch was inert:
  a `"Completed"` inside a comment terminated the bash `-c "..."` string, so
  python never received the age check and preflight passed unconditionally —
  a guard that always says yes. Rewrote section 2 as a QUOTED HEREDOC to
  remove the whole quoting hazard. BOTH paths now proven: passes on a stale
  row with an explicit "stale, not in flight" line, and returns RC=1 when the
  newest row is recent. Backup at /home/ubuntu/misc/preflight.sh.bak-20260901.
- **Task 2 IMPLEMENTED, NOT DEPLOYED — needs Zain.** The plan's city-token
  allowlist was measured against 14 days of prod rows and REJECTED: it would
  have deleted ~146 real events whose city is a neighbourhood (Roma Norte 35,
  Roma 23, Seminyak 19, Canggu 8, Neukoelln 8+, Highland Park 10, West
  Hollywood 7, DTLA 6, Hollywood 5, Polanco 5, Condesa 4...). country/state
  cannot separate them from a tour's same-country stops (Hamburg/Berlin,
  Monterrey/CDMX carry identical country + null state). Instead the extractor
  classifies each event's metro and code drops only an explicit OTHER;
  UNKNOWN, served metros and non-event payloads are all kept, so ambiguity
  never deletes. 148 tests green (5 new). Commit 7e93b54. GATE: one live
  extraction call against a real tour post before this touches production.
- **Task 3 HELD** at Zain's instruction ("go later, but not now"), though
  Lafayette approved it and asked for it to be automatic thereafter.
