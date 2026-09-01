# Phase 5 readiness and project close-out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the nightly structured-extraction flag safe to turn on (roundup re-scrapes must converge, not churn), keep `main` matching production, and hand the project over cleanly.

**Architecture:** Two small, test-first changes — a per-cluster keeper choice inside the existing `--exact` pass, and a post-date anchor in the extraction prompt — then a flag flip with one night of observation and a hard rollback trigger. Everything else is repository/ops hygiene gated on decisions outside the code.

**Tech Stack:** Django 5.0.6 management command, rapidfuzz, OpenAI structured outputs (`beta.chat.completions.parse`, openai 1.54.4), rsync deploy script on EC2.

## Global Constraints

- Production is live, no staging, SQLite on one EC2 box. **Never stop/reboot the instance.**
- Mutation window **03:00–20:30 UTC**; always run `/home/ubuntu/misc/preflight.sh` first; never override a failure.
- `manage.py` on the server needs `OPENAI_API_KEY` set even for commands that never call OpenAI.
- Branches only; run `/code-review` before committing; never commit secrets. The repo is PUBLIC and publishes working admin credentials — do not add exploit detail to it.
- Verification is unfiltered: full test suite, full build. Sync `server-api` from `HEAD:API/API` (never `HEAD:API`) and verify `manage.py` is at the rehearsal clone's root before any deploy.
- Confirm money-spending actions (OpenAI/Apify) before running them; ~$4.8 of the approved $5 remains.

---

## Status at time of writing (2026-08-28 07:10 UTC)

**Live and verified in production**
- Tickets 1–3, merged to `main` (PR #1). Post-merge fixes deployed and on PR #2 (open): tiered keeper choice, textless-pair collapse, content-derived identity for multi-event posts, `openai` pinned/upgraded to 1.54.4.
- Nightly scrape + nightly dedupe both run unattended. Last night: 280 rows, all keyed, 0 keyed-parent re-scans, 116 rows collapsed by the 03:37 cron, 0 tracebacks.
- Re-pasting a multi-event post can no longer overwrite a different event (verified by replay).

**Not done**
- Flag flip. Blocked on two things below (Tasks 1–2): roundup re-extraction still creates drift twins, and the exact pass queues a roundup's distinct events against each other. Review queue is 146 and creeping (+24/night) for that reason.
- `main` ≠ production until PR #2 merges.
- Docs (AUDIT/PLAN/CLAUDE) uncommitted until the repo is private.
- Security backlog (public admin credentials, JWT key `'secret'`, no Elastic IP, AWS key shared in chat).

---

### Task 1: Per-cluster keeper choice in the exact pass

Today `_exact()` picks ONE keeper per shortcode group and compares every other
row to it. That is right for a single-event post and wrong for a roundup: the
group legitimately holds N distinct events, so each non-keeper row with a
different title is queued for review ("same-post pair"), and a drift twin of
event B is compared to keeper A and queued instead of collapsed. Measured
2026-08-27: of 4 drift twins created by re-pasting one roundup, 1 collapsed and
3 were queued.

**Files:**
- Modify: `API/API/event/management/commands/detect_duplicates.py` (`_exact`, currently lines ~100–175)
- Modify: `API/API/event/test_detect_duplicates.py` (append)

**Interfaces:**
- Consumes: `event_signature(event)`, `same_post_is_redundant(a_sig, b_sig)` from `event/dedupe.py` (unchanged), `completeness(event)` and `has_extracted_text(event)` from the command module (unchanged).
- Produces: a module-level `cluster_same_post_rows(rows) -> list[list[Event]]` used by `_exact`.

- [ ] **Step 1: Write the failing tests**

Append to `API/API/event/test_detect_duplicates.py`:

```python
class RoundupClusterTests(TestCase):
    """A post that yields several DISTINCT events must keep one row per
    event, collapse drift twins WITHIN each event, and must not queue the
    distinct events against each other."""

    def _row(self, key, name, day, **kw):
        base = dict(shortcode='RENATE', source_key=key, name=name,
                    start_date=timezone.now() + timedelta(days=day),
                    is_duplicate=False, suppressed=False, is_event=True,
                    orig_link='https://www.instagram.com/p/RENATE/',
                    orig_thumb='https://img/%s.jpg' % key)
        base.update(kw)
        return Event.objects.create(**base)

    def test_distinct_events_of_one_post_are_not_queued_or_hidden(self):
        self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0)
        self._row('RENATE__eb', 'GREEN hosted by Handmade DJ', 1)
        self._row('RENATE__ec', 'RED hosted by Franz Scala', 2)
        call_command('detect_duplicates', '--exact')
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 0)

    def test_drift_twin_collapses_into_its_own_event_not_the_first_row(self):
        a = self._row('RENATE__ea', 'GARDEN hosted by Remoto Rec', 0, artist='Atomlui')
        b = self._row('RENATE__eb', 'GREEN hosted by Handmade DJ', 1)
        twin = self._row('RENATE__eb2', 'Green hosted by Handmade DJ', 1)   # re-extraction drift
        call_command('detect_duplicates', '--exact')
        twin.refresh_from_db(); a.refresh_from_db(); b.refresh_from_db()
        self.assertTrue(twin.suppressed)
        self.assertEqual(twin.canonical_id, b.id)          # its own event, not row A
        self.assertFalse(a.suppressed); self.assertFalse(b.suppressed)
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 0)

    def test_single_event_post_behaviour_unchanged(self):
        a = self._row('P__0__0', 'Klubnacht', 0, artist='X')
        self._row('P__0__1', 'Klubnacht', 0, shortcode='P')
        # both rows belong to post P
        Event.objects.filter(source_key__startswith='P__').update(shortcode='P')
        call_command('detect_duplicates', '--exact')
        self.assertEqual(Event.objects.filter(shortcode='P', suppressed=True).count(), 1)
        self.assertEqual(Event.objects.get(shortcode='P', suppressed=True).canonical_id, a.id)
```

Add `from datetime import timedelta` to the imports at the top of the file.

- [ ] **Step 2: Run them to verify the first two fail**

Run: `cd API/API && ./.venv/bin/python manage.py test event.test_detect_duplicates.RoundupClusterTests -v 2`
Expected: `test_distinct_events_of_one_post_are_not_queued_or_hidden` FAILS
(2 pending pairs queued today), `test_drift_twin_collapses_into_its_own_event_not_the_first_row`
FAILS (twin queued or pointed at row A), the third PASSES.

- [ ] **Step 3: Add the clustering helper**

In `API/API/event/management/commands/detect_duplicates.py`, after `has_extracted_text`:

```python
def cluster_same_post_rows(rows):
    """Split one post's rows into clusters that are the SAME event.

    A single keeper per post is right for a single-event post and wrong for
    a roundup, whose rows are N distinct events: comparing every row to one
    keeper queued each distinct event as a "same-post pair" and compared a
    re-extraction twin of event B against keeper A. Rows join a cluster when
    same_post_is_redundant says they are one event (similar title, dates
    within a day, or no contradicting evidence). Clustering is greedy in id
    order, so the oldest row seeds each cluster and results are stable.
    """
    clusters = []
    for row in rows:
        sig = event_signature(row)
        for cluster in clusters:
            if same_post_is_redundant(cluster['sig'], sig):
                cluster['rows'].append(row)
                break
        else:
            clusters.append({'sig': sig, 'rows': [row]})
    return [c['rows'] for c in clusters]
```

- [ ] **Step 4: Use it in `_exact`**

Replace the body of the per-group loop so that, after `rows` is loaded (ordered
by id) and the `< 2` guard, it iterates clusters:

```python
            for cluster in cluster_same_post_rows(rows):
                if len(cluster) < 2:
                    continue                      # a distinct event; nothing to do
                canonical = max(cluster, key=completeness)
                canonical_sig = event_signature(canonical)
                for row in cluster:
                    if row.id == canonical.id:
                        continue
                    lo, hi = sorted((canonical.id, row.id))
                    row_sig = event_signature(row)
                    ambiguous_pair = (
                        not canonical_sig['name'] and not row_sig['name']
                        and has_extracted_text(row) and has_extracted_text(canonical))
                    if ambiguous_pair:
                        ...existing queue branch unchanged...
                        continue
                    ...existing collapse branch unchanged...
```

The `not same_post_is_redundant(...)` half of the old condition is now
implied by cluster membership, so only the `ambiguous_pair` check remains in
front of the queue branch. Keep every comment that explains the queue and
collapse branches; move the "distinct events in one post" comment onto the
`len(cluster) < 2` line.

- [ ] **Step 5: Run the full suite, unfiltered**

Run: `cd API/API && ./.venv/bin/python manage.py test event c_admin c_auth`
Expected: `Ran 107 tests ... OK`. Any failure = stop.

- [ ] **Step 6: Dry-run on production data before deploying**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/deploy-rehearsal/api && cp /home/ubuntu/EventTracker-API/API/db.sqlite3 /tmp/dryrun.sqlite3 && \
   OPENAI_API_KEY=x DJANGO_DB_PATH=/tmp/dryrun.sqlite3 /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates --exact --dry-run 2>&1 | grep "^\[exact\]"; rm -f /tmp/dryrun.sqlite3'
```

(If `settings.py` does not honour `DJANGO_DB_PATH`, run the dry-run from the
LIVE checkout after deploying — it writes nothing.) Expected: "would suppress"
in the low hundreds (drift twins) and "queued" noticeably BELOW the current
146, because distinct roundup events are no longer paired.

- [ ] **Step 7: Review, commit, deploy**

Stage the two files, run `/code-review` (project rule), commit, push, sync
`server-api` from `HEAD:API/API`, pull the rehearsal clone, verify
`manage.py` at its root, `deploy_api.sh --dry-run`, then `deploy_api.sh`.
Then run `/home/ubuntu/EventTracker-API/API/run_dedupe.sh` once, attended,
and record the pending count before/after.

---

### Task 2: Anchor extraction dates on the post's publish date

Weekday-only flyers ("Wed / Thu / Fri") resolve to different calendar dates
run to run: the same post extracted twice gave Aug 27–29 and then Aug 26–28.
The prompt says "the current date is {today}"; for a post published days ago
that is the wrong anchor. Apify returns the post's `timestamp`.

**Files:**
- Modify: `API/API/c_admin/extraction.py` (`PROMPT`, `build_messages`, `extract_events`)
- Modify: `API/API/c_admin/post_ingest.py` (pass the post timestamp through) and the two callers (`c_admin/views.py` manual path, `c_admin/scraper.py` structured path)
- Test: `API/API/c_admin/test_extraction.py`

**Interfaces:**
- Produces: `extract_events(client, image_urls, caption="", ..., post_date=None)`; when `post_date` (ISO string or datetime) is given, the prompt's date sentence becomes "This post was published on {post_date}; today is {today}. Resolve weekday names and 'this week' relative to the PUBLISH date."

- [ ] **Step 1: Write the failing test**

```python
def test_prompt_anchors_on_post_date_when_given(self):
    msgs = build_messages(["http://img/1.jpg"], caption="Wed: X / Thu: Y",
                          post_date="2026-08-24")
    text = msgs[-1]["content"][0]["text"]
    self.assertIn("published on 2026-08-24", text)
    self.assertIn("relative to the PUBLISH date", text)

def test_prompt_falls_back_to_today_without_post_date(self):
    msgs = build_messages(["http://img/1.jpg"], caption="x")
    self.assertNotIn("published on", msgs[-1]["content"][0]["text"])
```

- [ ] **Step 2: Run to verify they fail** — `TypeError: unexpected keyword 'post_date'`.

- [ ] **Step 3: Implement** — add `post_date=None` through `build_messages` and
`extract_events`; in `PROMPT` replace the single date sentence with a
`{date_context}` placeholder filled by one of the two sentences above. In
`post_ingest`/callers, read `post_data.get("timestamp")` (Apify ISO string)
and pass it as `post_date`.

- [ ] **Step 4: Full suite** — `Ran 109 tests ... OK`.

- [ ] **Step 5: Validate live, locally (~$0.04, confirm spend first)** — re-paste
`https://www.instagram.com/p/DcgSE9_tyqZ/` twice against the LOCAL stack
(`EVENT_API_HOST` local) after clearing that shortcode's local rows. Expected:
run 2 dates equal run 1 dates; after `detect_duplicates --exact` locally, visible
rows == run 1 count.

- [ ] **Step 6: Review, commit, deploy** as in Task 1 Step 7.

---

### Execution record — Tasks 1–2 (2026-08-28)

**Task 1 (per-cluster keeper):** built test-first (5 tests). Review found a
real hole: a nameless/dateless row that is OLDEST seeded a cluster that
absorbed every titled event (an empty signature contradicts nothing) and
re-queued them. Fixed: textless rows attach last, and membership is judged
against each cluster's most complete member, not a frozen seed; clusters are
re-sorted by id. Local dry-run on the prod copy: queued 109 → 4, 15 drift
twins now collapse. Regression reviewer: SAFE; recommended a one-off to
retire already-pending pairs whose sides now fall in different clusters
(`retire_stale_pairs.py`, dry-run first).

**Task 2 (publish-date anchor):** built test-first. The acceptance replay
initially FAILED — every event came back undated. A/B with the exact manual
inputs found the cause: an ISO anchor ("published on 2026-08-26") made the
model emit ISO `start_date`s that the server could not parse. Fixed by
rendering the anchor in long form plus an explicit "MM-DD-YYYY regardless"
instruction; unparseable anchors fall back to today. Review also found the
batch path's `taken_at_timestamp` is the SCRAPE time, not the publish time;
fixed additively (new `published_at` on the image object, `taken_at_timestamp`
and the freshness filters untouched) — this is a one-key addition inside the
live `process_post`, flagged to the owner. Replay after the fix: run 2 landed
3 of 4 events on the same rows, the one wording-drift twin collapsed into its
own event after `--exact`, visible == run 1, 0 queued, 0 overwrites. Both
runs dated consistently. 116 tests.

**Deployed 2026-08-28 07:55 UTC (1132e93 / PR #3 534b556).** Attended
nightly pass on prod: 12 drift twins collapsed. Retire pass (both sides
titled AND titles dissimilar after punctuation stripping, otherwise kept for
the owner): 40 stale pairs rejected, pending **146 → 110**; invariants 0/0.
One retired pair was a handle-vs-title of the same event
("justlikeheavenfest" / "Just Like Heaven Fest") — space-insensitive
containment check re-pended those. Lesson for the fuzzy/exact rules: an
Instagram handle used as a title defeats token matching; a squashed
(space- and punctuation-free) comparison belongs in `same_post_is_redundant`
eventually (not changed now — it would alter what the nightly collapses).

**Follow-up found by live E2E (08:00 UTC):** a merely PENDING EventMatch
made the collapse branch skip pairs that today's rule covers; pending is not
a decision, so such pairs are now collapsed and marked confirmed, while
`rejected`/`confirmed` stay untouched (tests incl. the confirmed-then-restored
case; 119 total). Deployed f73d136; the attended pass is now a no-op
(`suppressed 0`), pending 117, invariants 0/0.

**Task 4 DONE:** PR #3 (4 commits) squash-merged 08:02 UTC → `main` 9ae0466;
`main:API/API` tree == `server-api` tip, i.e. **main matches production**.

**STOPPED at Task 3's gate:** the flag flip changes what every night's
extraction costs and produces; the owner must confirm the recurring OpenAI
cost first (MEASURED 2026-08-28 on live token usage and a 7-night average: legacy = one call per slide, ~259 slides/night ≈ $0.65/night ≈ $19/month; structured = one call per post, ~133 posts/night ≈ $0.65–0.81/night ≈ $20–24/month. The earlier $1–3/night figure was a guess and wrong.)

### Task 3: Flip the flag and watch one night

Only after Tasks 1–2 are deployed and the local double-paste converges.

- [ ] **Step 1: Back up the env and set the flag**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && cp .env.local .env.local.bak-$(date -u +%Y%m%d-%H%M%S) && \
   grep -q STRUCTURED_BATCH_EXTRACTION .env.local || echo "STRUCTURED_BATCH_EXTRACTION=True" >> .env.local && \
   sudo systemctl restart gunicorn && sleep 5 && systemctl is-active gunicorn'
```

- [ ] **Step 2: Confirm the process sees it**

```bash
ssh ... 'cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python -c "from c_admin.scraper import STRUCTURED_BATCH_EXTRACTION as F; print(F)"'
```
Expected: `True`.

- [ ] **Step 3: After the 21:01 UTC run and the 03:37 dedupe, compare with the night before**

Rows created, % with a title, % with a date, content-keyed rows (`source_key LIKE '%__e%'`),
tracebacks, pending-pair delta, OpenAI spend for the night (one call per post;
expect on the order of $1–3 for ~150 posts — confirm with the owner that this
recurring cost is acceptable BEFORE flipping).

- [ ] **Step 4: Hard rollback trigger** — if titled-% or dated-% drops versus the
previous night, or tracebacks > 0, remove the line from `.env.local` and restart
gunicorn. Legacy path resumes with no other change.

---

### Task 4: Merge PR #3 (needs owner/user go)

PR #2's diff re-showed PR #1's squash-merged history (the dedupe fixes were
already inside PR #1's squash); it was closed and replaced by **PR #3**, a
clean branch `post-deploy-fixes` = `main` + the identity commit (274ef1c) +
the review follow-up (c758eac). The full five-angle `/code-review` ran on
PR #3 on 2026-08-28: two real findings (undated same-name collision,
recurring-inside-roundup), both scored 75, both fixed in c758eac with tests
(107 total) and **deployed** the same morning. Merge with
`gh pr merge 3 --repo lafataylor/Eventtracker-FS --squash`.

Live E2E after that deploy (agent-browser, 2026-08-28 07:5x UTC): feed 244
cards; search techno 15 / accent-fold "cafe" 4 / venue "zinco" 6 / nonsense 0;
admin login through the real form; duplicates page renders the queue.

---

### Task 5: Docs and security hygiene (gated on decisions outside the code)

- [ ] Commit `AUDIT.md`, `PLAN.md`, `CLAUDE.md` only after the repo is private
  (they document how to exploit the public credentials). Genericise absolute paths first.
- [ ] Rotate the `dummy_` admin credentials AND update the server's cron/env in
  the same window (`get_headers()` gates ingestion; changing one side kills the
  nightly scrape). Needs an EBS snapshot first.
- [ ] Move the JWT signing key out of `c_auth/authentication.py` into env
  (invalidates all sessions — coordinate with the owner).
- [ ] Elastic IP (Bluehost DNS window), rotate the AWS key shared in chat.
- [ ] **Disk (73%, 8.6G free on 2026-08-28).** The driver is
  `/home/ubuntu/EventTracker-API/API/posters` at 7.6G: every scrape keeps a
  local copy of each image even though the pipeline mirrors it to Firebase
  and stores that URL. Pre-existing behaviour, grows daily. Options, each
  needing a go: (a) a nightly `find posters -type f -mtime +14 -delete` after
  the scrape (images older than two weeks are never re-read); (b) delete
  `EventTracker-FE.old-20260826-060837` (1.2G rollback dir) once the FE deploy
  is considered settled; (c) keep only the newest two DB copies in
  `dbBackups` (DLM snapshots are the real backup). Never delete logs — truncate.

### Task 6: Hours and hand-off

- [ ] Log hours honestly against the 10h/week cap; no upselling. Today's work:
  leak verification, dedupe fixes (3 review rounds), openai upgrade, PR merge,
  roundup validation, identity fix (2 review rounds), one-off queue cleanup.
- [ ] Hand the owner a two-line status: queue at ~146 and why it creeps, what
  the flag flip will change, and the recurring OpenAI cost it implies.
