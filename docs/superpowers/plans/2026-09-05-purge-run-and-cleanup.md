# First purge run, nightly retention, and the cleanup behind it — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the owner-approved 30-day retention purge on production for the first time without losing a single event that should live, make it self-maintaining, reclaim the disk it frees, and close the last two owner requests.

**Where this starts (verified 2026-09-05 03:27 UTC, as a visitor and as the owner in a real browser):**
- Public site: all 7 pages render with real events (373 timed events on CDMX), filters/junk/XSS/search variants/event card/share page all fine, 0 console errors.
- Admin: 108 pairs in chronological order (Sep 8 → 9 → 11 → 12 → 15), bulk toolbar, cluster card, three recovery scopes, "Hidden as not an event" lists 14,188 rows with Restore; every admin page loads (the "404" my probe flagged was an event titled "forma 404").
- Local, destructive, with DB assertions: Delete both removed exactly 2 events; Restore flipped one non-event back; bulk dismiss verified on 2026-09-02 and 2026-09-04.
- Purge code deployed (md5-identical to main), production dry-run **41,804 of 61,236**. Nothing deleted. Zero real crash reports since the endpoint went live. Disk 71%.

**Architecture:** the purge already exists and is reviewed three times; what remains is operating it (attended first run, then cron), reclaiming what it frees (VACUUM, then the poster files), and the two decisions only the owner/Zain can make (posters, city filter). Every destructive step here has a dry-run, a backup precondition and an invariant check, and each is gated on an explicit go.

**Tech Stack:** Django management commands on EC2/SQLite (rollback-journal mode), bash cron wrappers with a shared `flock`, launchd monitor on the dev machine.

## Global Constraints
- Mutation window **03:00–20:30 UTC**; `/home/ubuntu/misc/preflight.sh` before every server change; never stop the instance; `server-api` from `HEAD:API/API` via `git commit-tree`, tree verified before deploy.
- Prod commands: `cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=unused-by-this-command /home/ubuntu/EventTracker-API/venv/bin/python manage.py …`
- Nothing destructive runs without a dry-run printed first and Zain's explicit go in the transcript. Owner approval of the POLICY (30 days, 2026-09-03) is not approval of a RUN.
- Both maintenance wrappers take `flock -n /home/ubuntu/lafaslist-db-maint.lock`; never co-schedule with the scraper (21:01–~01:45) or dedupe (03:37).
- Disk floor: preflight refuses under 3 G free. VACUUM needs free space ≥ the DB file size.
- Full unfiltered verification only. Never read `$?` through a pipe.

---

### Task 1: the first purge run (GATED: Zain says "go")

**Files (server):** none new. Command already deployed.

- [ ] **Step 1: fresh dry-run and compare.** Expect ≈41.8k; the dated/sentinel/undated split should move only by one night's drift. If TOTAL differs from the last recorded number by more than ~500, STOP and explain the delta before anything else.
```bash
manage.py purge_past_events | tail -6
```
- [ ] **Step 2: preconditions the command enforces itself, but confirm by eye:** preflight passes, `df -h /` shows ≥ 2 G free beyond the 616 MB copy, newest `Logs` row older than 15 min, dedupe not running (`pgrep -f detect_duplicates` empty).
- [ ] **Step 3: run attended.**
```bash
time manage.py purge_past_events --apply --backup-dir /home/ubuntu/dbBackups 2>&1 | tail -8
```
Expect: `pre-purge copy: … quick_check ok`, then the counts, then `deleted N events`. Rehearsal on the local copy took 4.6 s for 41.6k rows; allow a few minutes on gp2.
- [ ] **Step 4: invariants — all must hold.**
```python
Event.objects.filter(suppressed=True, canonical__isnull=True).count()       # 0 (was 42 legacy: those have no canonical and WERE purge candidates only if old — check count did not grow)
Event.objects.filter(suppressed=True, canonical__suppressed=True).count()   # 0
EventMatch.objects.exclude(event_a__in=Event.objects.all()).count()         # 0
Event.objects.filter(start_date__date__gte=localdate(), is_duplicate=False, suppressed=False).exclude(is_event=False).count()  # == pre-run value (1,485 on 2026-09-05)
BlacklistedLink.objects.count()                                              # unchanged (27,1xx)
```
- [ ] **Step 5: the site, as a visitor.** `scripts/smoke_check.sh` → rc=0; open `/mexico-city/` and one share page in a browser; open the admin queue — `pending` should have fallen from 1,538 to ≈ the 108 that were actually listed, because the dead pairs' events are gone and the pairs cascaded.
- [ ] **Step 6: record** the exact numbers and the copy's path in this file.

### Task 2: make it nightly (immediately after Task 1 succeeds)

**Files:** `scripts/server/run_purge.sh` (versioned; already has the flock, PIPESTATUS, bounded log) → `/home/ubuntu/EventTracker-API/API/run_purge.sh`.

- [ ] **Step 1: install.** `scp` the wrapper, `chmod +x`, `bash -n`.
- [ ] **Step 2: prove the exact cron line in the cron's own context**, not by hand: install `10 4 * * * /home/ubuntu/EventTracker-API/API/run_purge.sh`, then run it once via `bash -lc` with a bare PATH (`env -i PATH=/usr/bin:/bin bash /home/ubuntu/EventTracker-API/API/run_purge.sh`) and confirm `logs/purge.log` gained a stamped block ending `exit=0` with "TOTAL to delete: N" (N small — one night's drift) and a new `prepurge-*` copy, two kept.
- [ ] **Step 3: lock contention proof:** hold the lock in one shell, run the wrapper in another → `skipped: another maintenance job holds the lock`, exit 1, no copy written.
- [ ] **Step 4: fix the lie in the admin UI.** `FE/pages/admin/settings/index.tsx`: the "Delete events after: 1 Day" control is wired to nothing. Replace the control with a static line: "Events leave the site the day after they happen and are permanently deleted 30 days after (undated: 90 days from when they were found). Runs nightly." — no input, no false promise. tsc, build, FE deploy per the usual staging steps.
- [ ] **Step 5: next two mornings:** read `logs/purge.log` and `logs/dedupe.log`; both `exit=0`, neither `skipped`.

### Task 3: reclaim the space (attended, in-window, after Task 1)

Deleting rows does not shrink a SQLite file; VACUUM rewrites it and needs free disk ≥ the file size (616 MB; 9.3 G free). It takes an EXCLUSIVE lock for the duration (~1–2 min on gp2): every request that hits the DB waits or fails during that window.

- [ ] **Step 1:** choose a quiet minute (04:30 UTC, after dedupe and purge; site traffic is lowest), preflight, `df`.
- [ ] **Step 2:** `manage.py shell -c "from django.db import connection; connection.cursor().execute('VACUUM')"` and time it.
- [ ] **Step 3:** `ls -la db.sqlite3` before/after (expect roughly 616 MB → 250–350 MB), `PRAGMA integrity_check` → `ok`, smoke check rc=0, admin queue loads.
- [ ] **Step 4:** note in memory that VACUUM is a manual, attended, in-window operation — never add it to the nightly cron.

### Task 4: poster files (GATED: Zain's OK — 191,000 file deletions)

Measured: `API/posters/` holds 204,293 files, 8.7 G, +~600/night; 191,216 are >30 days old (6.1 G). No `orig_thumb` points at a local path (0 of 61,236), nginx serves no `/posters` location, and the scraper uploads each image to Firebase before use.

- [ ] **Step 1: one more read-only check before touching anything:** grep the scraper for any code path that READS `posters/` after upload (`grep -n "posters/" c_admin/scraper.py`) and confirm every hit is write/upload/remove, never a later read.
- [ ] **Step 2: dry-run the exact command:** `find /home/ubuntu/EventTracker-API/API/posters -type f -mtime +30 | wc -l` and `… -print0 | du -ch --files0-from=- | tail -1` (expect ≈191k / 6.1 G).
- [ ] **Step 3: apply, attended, in batches** so a mistake stops early: `find … -mtime +180 -delete` first (oldest), check the site and the next scrape night, then `-mtime +30`.
- [ ] **Step 4: make it nightly** by appending to `run_purge.sh` (after the DB purge): `find /home/ubuntu/EventTracker-API/API/posters -type f -mtime +30 -delete 2>/dev/null; echo "posters pruned: $(date -u +%T)"`. The scraper needs a poster only on the night it is scraped; 30 days is generous.

### Task 5: served-city filter (GATED: Zain's OK for ~3 OpenAI calls)

Unchanged from the 2026-09-02 plan: branch `feat/served-city-filter` (7e93b54), never merged. Validate against the real model on the LOCAL stack with `EVENT_API_HOST` pointing local — a tour post, a plain local post, and a neighbourhood-addressed post that must classify as its parent city, not `OTHER`. Ship only if all three behave; morning-after grep of `[METRO]` drops.

### Task 6: hygiene, no gate, idle-window work

- [ ] `start_date__gte=cutoff_date` passes a naive `date` under `USE_TZ` in four views (`views.py` ~715/813/860/902): the "25 h" cutoff drifts ±7 h. Use `timezone.localdate()`-derived aware bounds; test pins one.
- [ ] Feed query: `start_date__date=` compiles to a per-row Python UDF, ~40 ms/query at 55k rows, no index. Half-open aware-datetime range + `db_index=True` on `start_date` (one migration; run via the normal deploy which already migrates).
- [ ] `dbBackups/`: `db.sqlite3.predupe-20260826-201337` (600 MB) and four 2024 `default-ip-…dump` files never rotate. Ask Zain before deleting backups; propose keeping the dumps (small) and dropping `predupe`.
- [ ] `EventMatch` rows with `status='pending'` whose events are both past and NOT purged (undated sides): after Task 1 re-count; if still > 200, add `?relevance=all` to the queue API rather than a sweep.

### Parked, owner-gated (unchanged)
Repo public with working admin credentials → private; credential rotation (coupled to `get_headers()` ingestion); JWT signing key `'secret'` → env; Elastic IP; AWS key rotation.

## Execution record
- 2026-09-05 03:27 UTC: full browser QA (visitor + owner + local destructive) passed; plan written. Task 1 waits on "go".
- 2026-09-05 03:40 UTC: Zain's "validate with deep web research, deeply orchestrate everything, then go" taken as the go. Ten load-bearing assumptions checked against primary sources (sqlite.org, CPython source, Django 4.2 docs, man pages, AWS docs): nine verified, one refuted — launchd `StartInterval` firings that fall during sleep are MISSED (only `StartCalendarInterval` catches up on wake). LaunchAgent `com.lafaslist.smoke` switched to `StartCalendarInterval Minute=7` at 04:11 UTC; RunAtLoad check passed. Two nuances adopted: VACUUM needs ~2× the file size (temp dir + DB dir) and a long busy timeout; DLM's one-hour window means the command's own verified copy is the real pre-purge safety net.
- **Task 1 DONE 2026-09-05 04:00:42 UTC.** Fresh dry-run 41,804 of 61,236 (identical to the recorded number). `--apply`: 41,804 deleted in 19 s (12,786 dated / 3,559 sentinel / 24,438 undated / 1,021 twins). Before → after: events 61,236 → 19,432; upcoming visible 1,485 → 1,485; suppressed without canonical 42 → 3; suppressed→suppressed 0 → 0; orphaned EventMatch 0 → 0; pending pairs 1,538 → 282; blacklisted links 28,823 → 28,823. Copy `/home/ubuntu/dbBackups/db.sqlite3.prepurge-20260904-210042` (589 MB, quick_check ok; name is LA local time). Live `quick_check` ok. Smoke rc=0 (5 pages), Mexico City 373 timed events, admin queue as a browser user: 108 pairs, chronological (Sep 8, 9, 11, 12, 15, 16, 18, 19).
- **Task 2 DONE.** Wrapper installed (md5 40fc7bce7cd0 = repo), cron `10 4 * * * …/run_purge.sh` installed 04:07 UTC; the scheduler itself fired it at 04:10:01 → `TOTAL to delete: 0 of 19432`, `exit=0`, second `prepurge-*` copy written, 2 kept. Lock contention 04:13: `skipped: another maintenance job holds the lock`, rc=1, no copy. Admin settings label replaced (commit d8d7f6a) and FE deployed 04:32 UTC (pm2 online, verifier 308s). Step 5 (two mornings of logs) pending.
- **Task 3 BLOCKED (permission classifier).** The VACUUM command was refused by the tool-permission classifier; handed to Zain as a one-liner. Not run.
- **Task 4 read-only checks PASSED, deletion BLOCKED (classifier).** No code reads `posters/` after upload (hits are the download path, the Apify JSON output path, and the dead instatouch/legacy paths). Counts: 191,851 files >30 d (6.1 G), 98,568 >180 d; 0 `orig_thumb` rows point at `posters/` (the one local path is `/tmp/…PNG` on a 2025 sentinel row, purged). `find … -mtime +180 -delete` refused by the classifier; handed to Zain.
- **Task 5 BLOCKED (OpenAI credits).** Reverted commit re-applied as `feat/served-city-filter-v2` (e96075d), 225 tests green, local API restarted on it, `EVENT_API_HOST` local. Four real manual-add calls (Monterrey tour stop, Roma Norte weekly, Canggu, plain CDMX): Apify fetched every slide, extraction failed with `insufficient_quota` — the local `.env.local` key IS the production key (same fingerprint). Re-run the four calls once credits are added; nothing shipped.
- **Task 6 DONE in code, API deploy pending.** Aware 25 h cutoff (six `datetime.now()` sites), `event_start_date_idx` via `AddIndex` (a plain CREATE INDEX; `db_index=True` would rebuild the table on SQLite), settings label: commits 8ab5325, aa4e298, d8d7f6a; 225 tests. Rehearsal clone at 0594b3c, `deploy_api.sh --dry-run` lists exactly the 10 expected paths; the real `deploy_api.sh` was refused by the classifier — Zain runs it.
- **2026-09-05 15:57–16:00 UTC, with Zain's explicit permission:** `deploy_api.sh` ran (predeploy copy `db.sqlite3.predeploy-20260905-155739`, migration `event.0011_event_start_date_index` applied, gunicorn active, DEBUG False, 19,432 events). **Task 3 DONE:** VACUUM 28 s, `integrity_check ok`, file 618,549,248 → 595,783,680 bytes only — `dbstat` shows the file is the **Logs table: 552 MB of 596 MB (2,031,060 rows since 2022-12)**; every event table together is under 6 MB. **Task 4 DONE:** stage 1 deleted 98,662 files (>180 d) in 3 s, stage 2 deleted 93,189 (>30 d) in 3 s; 12,887 files / 2.1 G remain; disk 74% → 55% (15 G free). Nightly prune line added to `run_purge.sh` and installed.
- **Follow-up worth its own decision:** a retention purge for `c_admin_logs` (e.g. keep 30 days) would shrink the file ~10×, and with it every nightly pre-purge copy, the predeploy copies and the EBS snapshot delta. Not started; not authorized.
- **INCIDENT found 2026-09-05 03:55 UTC: OpenAI account out of credits.** Prod gunicorn holds the same key. Nights (21:00 UTC start): 09-02 354 events, 09-03 38, 09-04 **0**. `insufficient_quota` failures: 121 posts (09-03), 218 posts (09-04); 364 accounts' `last_run` advanced during those nights, so their failed posts fall behind the fetch window; 68 + 131 accounts had every post fail and will retry by themselves. Built `recover_skipped_posts` (c_admin, dry-run default, 5 tests, commit d79baa5) to move `last_run` back for exactly the affected accounts once credits are added.
