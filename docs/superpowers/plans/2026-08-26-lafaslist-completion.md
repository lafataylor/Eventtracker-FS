# Lafa's List — Completion Plan (post-deploy)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the three contracted tickets by proving the duplicate leak is fixed in production, tidying the repo, and either shipping or formally deferring the carousel extraction flag.

**Architecture:** All three tickets are already deployed and live. The remaining work is (a) one night of production observation to prove the upsert closed the duplicate leak, (b) repo/PR hygiene, (c) an isolated dependency upgrade that unblocks the last feature flag, and (d) client handoff. No new feature code is required for tickets 1 and 3.

**Tech Stack:** Django 5.0.6 + DRF + SQLite on EC2 (gunicorn/nginx), Next.js 13.5.3 via pm2, OpenAI vision, Apify.

## Global Constraints

- Production is live with real users; there is no staging. One EC2 box, SQLite.
- **Never stop/reboot the instance** — no Elastic IP, so the public IP and all DNS change on stop.
- Deploy/mutate window is **03:00–20:30 UTC only**. Nightly scrape runs 21:01 → ~02:30 UTC; dedupe cron at 03:37 UTC.
- Always run `/home/ubuntu/misc/preflight.sh` before any production mutation; never override a failure.
- Snapshot or DB-copy before any data mutation. Truncate logs, never delete.
- Branches only; never force-push or rewrite `main`.
- Never commit secrets. Repo is public and already leaks live credentials (AUDIT §2).
- Confirm any money-spending action (OpenAI/Apify) before running it.
- Local runs must set `EVENT_API_HOST=http://127.0.0.1:8009/` or manual-add writes to PRODUCTION.
- Verification must be unfiltered: full `tsc --noEmit` + full `npm run build`, never grepped to changed files.

---

## Status at time of writing (2026-08-26)

**Done and live in production:**
- Ticket 1 (duplicate detection + side-by-side review UI) — deployed; 25,192 re-scrape rows collapsed; 107 pairs queued; nightly cron installed at 03:37 UTC.
- Ticket 2 (carousel multi-event extraction) — manual add-by-URL path live; batch path deployed but **flag-gated OFF**.
- Ticket 3 (search across all fields + accent folding) — deployed and verified live.
- Infrastructure rescue — disk 100%→67%, logrotate, DLM daily snapshots, 2GB swap.

**Not done:**
- Proof that the nightly upsert closed the duplicate leak (needs one scrape cycle to be observed).
- PR #1 is still open and unmerged (22 commits) while production already runs that code.
- Project docs (AUDIT.md, PLAN.md, CLAUDE.md) are untracked.
- `--fuzzy` pass not run (would add 3,610 cross-post pairs to the owner's queue).
- `STRUCTURED_BATCH_EXTRACTION` still off; blocked by server `openai==1.35.1` which lacks `beta.chat.completions.parse`.
- **VERIFIED LIVE EXPOSURE:** the repository is public and `c_admin/constants.py:7-8` publishes working production admin credentials (confirmed: a login using only public values returns HTTP 200). Rotating them is coupled to ingestion (see Task 8). Also outstanding: hardcoded JWT signing key `'secret'`, AWS key shared over chat, no Elastic IP.

---

### Task 1: Prove the duplicate leak is closed

The single most important remaining verification. Production ran on the old
code until 06:06 UTC today, so tonight (21:01 UTC) is the first scrape using
`upsert_event`. Legacy rows have `source_key = NULL` and can never be matched,
so tonight is expected to create a final batch of ~150 duplicates; the 03:37
dedupe collapses them, and from the following night the count must drop to
approximately zero.

**Files:**
- Read only: `/home/ubuntu/EventTracker-API/API/logs/dedupe.log` (server)
- Read only: `event/models.py` (`Event.source_key`, `Event.suppressed`)

**Interfaces:**
- Consumes: the deployed `upsert_event(event_model, source_key, shortcode, slide_index, defaults, overwrite=False)` from `event/ingest.py`.
- Produces: a go/no-go signal for declaring Ticket 1 complete.

- [ ] **Step 1: After 04:00 UTC on 2026-08-27, capture the dedupe cron's own log**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'tail -20 /home/ubuntu/EventTracker-API/API/logs/dedupe.log'
```

Expected: a block stamped `2026-08-27 03:37` reporting `suppressed N rows`.
`N` in the low hundreds is the expected one-off legacy catch-up.

- [ ] **Step 2: Measure how many duplicates the new code created**

Save as `API/API/_leakcheck.py` on the server and run from `/home/ubuntu/EventTracker-API/API`:

```python
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "event_tracker_api.settings")
django.setup()
from django.db.models import Count
from event.models import Event
from datetime import date, timedelta

for day in (date.today(), date.today() - timedelta(days=1)):
    codes = (Event.objects.filter(created_at__date=day)
             .exclude(shortcode__isnull=True).exclude(shortcode="")
             .values_list("shortcode", flat=True))
    codes = list(codes)
    dupes = (Event.objects.filter(shortcode__in=codes)
             .values("shortcode").annotate(n=Count("id")).filter(n__gt=1).count())
    print(day, "posts ingested:", len(set(codes)), "| posts now holding >1 row:", dupes)
```

Run: `OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python _leakcheck.py`
Expected: for the night of the 27th, `posts now holding >1 row` should be far
below the ~150/night baseline measured on 2026-08-26.

- [ ] **Step 3: Confirm new rows carry a source_key**

```python
from event.models import Event
from datetime import date
qs = Event.objects.filter(created_at__date=date.today())
print("created today:", qs.count(),
      "| with source_key:", qs.exclude(source_key__isnull=True).count())
```

Expected: nearly all rows created by the nightly scrape have a non-null
`source_key`. A zero here means the scraper is not sending post identity and
Task 1 has failed.

- [ ] **Step 4: Record the verdict on PR #1**

```bash
gh pr comment 1 --repo lafataylor/Eventtracker-FS \
  --body "Post-deploy verification: first nightly run on the upsert path created <N> duplicate rows (baseline was ~150/night). Dedupe cron collapsed <M> rows at 03:37 UTC."
```

- [ ] **Step 5: Clean up the throwaway script**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'rm -f /home/ubuntu/EventTracker-API/API/_leakcheck.py'
```

---

### Task 2: BLOCKED — do not commit the project docs to the public repo yet

**Status: blocked by a verified security exposure. Do not execute Steps 3+
until Task 2a is done.**

While running the pre-commit secret scan, the repository was confirmed
**public** (`gh repo view` → `visibility: PUBLIC`) and
`API/API/c_admin/constants.py:7-8` publishes working production admin
credentials. A login against live production using only values readable from
the public repo returns **HTTP 200**. This is pre-existing, not introduced by
this work, but it is live right now.

`AUDIT.md`, `PLAN.md` and `CLAUDE.md` each describe how to exploit this
(the forgeable JWT key, the admin password, which endpoints are effectively
unauthenticated). Publishing them turns a latent leak into a curated
exploitation guide, so they stay uncommitted until the repo is private.

**Do NOT** post any of these details into a PR comment, issue, or commit
message on the public repo — that compounds the exposure.

- [ ] **Step 1: Confirm the exposure is still live before acting**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS
gh repo view lafataylor/Eventtracker-FS --json visibility -q .visibility
git grep -nE "ADMIN_EMAIL|ADMIN_PASSWORD" -- 'API/API/c_admin/constants.py'
```

Expected: `PUBLIC`, and the two credential lines. If it already reports
`PRIVATE`, skip to Step 3.

- [ ] **Step 2: Ask the owner to make the repository private**

This is the owner's decision (it is their repository). It takes one action in
GitHub settings, causes **no downtime**, and does not affect the server: the
production box's git remote points at `Steed-Solutions/EventTracker-API`, and
deploys are performed by file sync from a local clone, not by the server
pulling from this repo.

Note it does not un-leak anything already public — the credentials still need
rotating (Task 8) — but it stops ongoing exposure immediately.

- [ ] **Step 3: Only after the repo is private, scan and commit the docs**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS
grep -nE "/Users/ZJaffery" AUDIT.md PLAN.md CLAUDE.md
```

Replace any machine-specific absolute path with a generic description, as was
already done in `LOCAL_SETUP.md`.

```bash
git add AUDIT.md PLAN.md CLAUDE.md
git commit -m "docs: add audit findings, master plan, and project brief"
git push origin feat/dedupe-and-carousel
```

- [ ] **Step 4: If the owner prefers to keep the repo public**

Do not commit `AUDIT.md`. Send it to the owner privately instead, and commit
only `CLAUDE.md` and `PLAN.md` after redacting the three lines naming the
admin password and the JWT key.

---

### Task 3: Merge PR #1

Production already runs this code. Leaving the branch unmerged means `main`
does not describe what is deployed, and the next person to branch from `main`
silently loses every fix.

**Files:**
- No file changes; repository state only.

**Interfaces:**
- Consumes: Task 1's verdict (do not merge until the leak fix is proven).
- Produces: a `main` branch that matches production.

- [ ] **Step 1: Confirm the branch is still green**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS/API/API
./.venv/bin/python manage.py test event c_admin c_auth 2>&1 | tail -3
```

Expected: `OK`, 82 tests.

- [ ] **Step 2: Confirm the FE still builds, unfiltered**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS/FE
npx tsc --noEmit; echo "tsc exit=$?"
npm run build 2>&1 | tail -5
```

Expected: `tsc exit=0` and a build that ends with the route table, no
`Failed to compile`.

- [ ] **Step 3: Merge**

```bash
gh pr merge 1 --repo lafataylor/Eventtracker-FS --squash --subject \
  "Tickets 1-3: duplicate detection and review UI, carousel extraction, full-field search"
```

- [ ] **Step 4: Verify main now matches what is deployed**

```bash
git fetch origin && git log --oneline origin/main -1
```

---

### Task 4: Unblock Phase 5 — upgrade `openai` on the server

`c_admin/extraction.py:154` calls `client.beta.chat.completions.parse`, which
does not exist in the server's `openai==1.35.1`. The flag cannot be flipped
until this is upgraded. The live nightly path uses only
`client.chat.completions.create` (`c_admin/scraper.py:1123`), an API that is
unchanged between 1.35.1 and 1.54.4, so the upgrade is low-risk — but it is a
production dependency change and must be reversible.

**Files:**
- Modify: `API/API/requirements.txt:14` (pin `openai`)
- Modify (server): `/home/ubuntu/EventTracker-API/venv` (package upgrade)

**Interfaces:**
- Consumes: `extract_events()` from `c_admin/extraction.py`.
- Produces: a server capable of running `clean_label_and_save_structured`.

**Blast radius, verified 2026-08-26 before touching production:**

| package | prod has | openai 1.54.4 needs | result |
|---|---|---|---|
| httpx | 0.27.0 | `>=0.23.0,<1` | no change |
| pydantic | 2.7.4 | `>=1.9.0,<3` | no change |
| anyio | 4.4.0 | `>=3.5.0,<5` | no change |
| typing_extensions | 4.12.2 | `>=4.11,<5` | no change |

So pip replaces `openai` and adds its new small dependency `jiter`, and
touches nothing else. The live nightly call
(`client.chat.completions.create` with `model`, `messages`, `max_tokens` —
`c_admin/scraper.py:1123`) was confirmed to accept that exact parameter set on
1.54.4, and `beta.chat.completions.parse` becomes available. Low risk, but
still take the freeze in Step 3 so it is reversible.

- [ ] **Step 1: Pin the version that was actually validated**

Edit `API/API/requirements.txt` line 14, changing `openai` to:

```
openai==1.54.4
```

An unpinned dependency is why prod and local drifted three minor versions apart.

- [ ] **Step 2: Commit the pin**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS
git add API/API/requirements.txt
git commit -m "deps: pin openai to the validated 1.54.4"
```

- [ ] **Step 3: Snapshot the venv so the upgrade is reversible**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/EventTracker-API/venv/bin/pip freeze > /home/ubuntu/misc/pip-freeze-before-openai-upgrade.txt && \
   tail -3 /home/ubuntu/misc/pip-freeze-before-openai-upgrade.txt'
```

- [ ] **Step 4: Run preflight, then upgrade**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/misc/preflight.sh && \
   /home/ubuntu/EventTracker-API/venv/bin/pip install --upgrade "openai==1.54.4" 2>&1 | tail -3'
```

Expected: `Successfully installed openai-1.54.4`. If preflight fails, stop.

- [ ] **Step 5: Verify BOTH code paths import and the legacy one is intact**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python -c "
import openai
from openai import OpenAI
c = OpenAI(api_key=\"x\")
print(\"openai\", openai.__version__)
print(\"legacy create available:\", hasattr(c.chat.completions, \"create\"))
print(\"structured parse available:\", hasattr(c.beta.chat.completions, \"parse\"))
"'
```

Expected: version `1.54.4`, and both availability lines `True`.

- [ ] **Step 6: Restart gunicorn and confirm the site is unaffected**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'sudo systemctl restart gunicorn && sleep 5 && systemctl is-active gunicorn'
curl -s -o /dev/null -w "api:%{http_code}\n" https://eventtrackerapi.lafaslist.com/v1/event/locations/
curl -s -o /dev/null -w "site:%{http_code}\n" https://lafaslist.com/mexico-city
```

Expected: `active`, `api:200`, `site:308`.

**Rollback if any step fails:**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/EventTracker-API/venv/bin/pip install "openai==1.35.1" && sudo systemctl restart gunicorn'
```

---

### Task 5: Validate a roundup post, then decide the flag

Phase 1 validation never caught a genuine roundup post (a single image listing
several distinct events), so the `single → N events` behavior is proven only
against mocks. This task closes that gap before the flag is flipped, and costs
roughly $0.03 of the approved $5.

**Files:**
- Read only: `API/API/c_admin/extraction.py` (`PROMPT`, `extract_events`, `expand_recurring`)

**Interfaces:**
- Consumes: `extract_events(client, image_urls, caption="", biography="", external_url="", ...) -> PostExtraction` with `post_type in {single, roundup, recurring}`. Note the OpenAI client is the FIRST argument.
- Produces: evidence for the go/no-go on `STRUCTURED_BATCH_EXTRACTION`.

- [ ] **Step 1: Find a real roundup post in production data**

Save as `API/API/_findroundup.py` on the server and run it:

```python
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "event_tracker_api.settings")
django.setup()
from event.models import Event
# Captions that list several events tend to use weekday or "cartelera" wording.
for e in (Event.objects.filter(is_event=True)
          .exclude(orig_link="").order_by("-id")[:400]):
    n = (e.name or "").lower()
    if any(k in n for k in ("semana", "cartelera", "line up", "lineup", "weekly", "agenda")):
        print(e.id, e.orig_link, "|", (e.name or "")[:60])
```

Run: `OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python _findroundup.py`
Expected: a handful of candidate Instagram URLs. Pick one whose flyer visibly
lists multiple dated events.

- [ ] **Step 2: Confirm the spend with the user before calling the API**

State the estimated cost (about $0.03) and the chosen URL, and wait for
explicit approval. Do not skip: money-spending actions require confirmation.

- [ ] **Step 3: Extract that post through the admin UI on production**

Open `https://lafaslist.com/admin/`, go to Events, `+ New Event`, choose the
Instagram URL tab, set Location, paste the URL, and click Fetch & Process.

Expected: for a true roundup, the overlay reports `Saved N events from this
post.` with `N > 1`. For a single-event post it opens one details dialog.

- [ ] **Step 4: Verify the saved rows are distinct events, not repeats**

```python
from event.models import Event
rows = Event.objects.filter(shortcode="<SHORTCODE>").order_by("id")
for e in rows:
    print(e.id, e.source_key, "|", (e.name or "(none)")[:40], "|", e.start_date)
```

Expected: distinct `source_key` values and genuinely different
name/date combinations.

- [ ] **Step 5: Record the decision**

If roundups extract correctly, proceed to Task 6. If the extraction collapses
a roundup into one event or invents events, **leave the flag off**, write the
failure into PR #1, and treat the prompt work as a separate follow-up. The
flag being off costs nothing: the legacy path keeps running exactly as today.

- [ ] **Step 6: Clean up**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'rm -f /home/ubuntu/EventTracker-API/API/_findroundup.py'
```

---

### Task 6: Flip `STRUCTURED_BATCH_EXTRACTION` and watch one night

Only run this task if Tasks 4 and 5 both passed. This changes how every event
on the site is extracted, so it gets its own night of observation.

**Files:**
- Modify (server): `/home/ubuntu/EventTracker-API/API/.env.local`
- Read only: `c_admin/scraper.py:2003-2004` (the flag), `:2144` (the gate)

**Interfaces:**
- Consumes: `clean_label_and_save_structured(account, exec_id, output_file_path, images_to_upload, headers, for_location)`.
- Produces: the batch path running structured extraction.

- [ ] **Step 1: Back up the env file and set the flag**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && \
   cp .env.local .env.local.bak-$(date -u +%Y%m%d-%H%M%S) && \
   grep -q STRUCTURED_BATCH_EXTRACTION .env.local || echo "STRUCTURED_BATCH_EXTRACTION=True" >> .env.local && \
   tail -2 .env.local'
```

- [ ] **Step 2: Confirm the process actually sees the flag**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'sudo systemctl restart gunicorn && sleep 5 && cd /home/ubuntu/EventTracker-API/API && \
   OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python -c "
from c_admin.scraper import STRUCTURED_BATCH_EXTRACTION as F
print(\"flag is\", F)
"'
```

Expected: `flag is True`.

- [ ] **Step 3: Let one nightly run happen, then compare extraction quality**

After the 21:01 UTC run completes (~02:30 UTC), compare the night's rows
against the previous night:

```python
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "event_tracker_api.settings")
django.setup()
from event.models import Event
from datetime import date, timedelta
for day in (date.today(), date.today() - timedelta(days=1)):
    qs = Event.objects.filter(created_at__date=day)
    total = qs.count()
    named = qs.exclude(name__isnull=True).exclude(name="").count()
    dated = qs.exclude(start_date__isnull=True).count()
    pct = (100.0 * named / total) if total else 0
    print(day, "rows:", total, "| named:", named, f"({pct:.0f}%)", "| dated:", dated)
```

Expected: the named percentage should be **at least as good** as the previous
night. A large drop means the structured path is extracting worse than the
legacy one.

- [ ] **Step 4: Roll back immediately if quality regressed**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && \
   sed -i "/STRUCTURED_BATCH_EXTRACTION/d" .env.local && \
   sudo systemctl restart gunicorn && systemctl is-active gunicorn'
```

---

### Task 7: Hand off to the client

**Files:**
- No code changes.

**Interfaces:**
- Consumes: Task 1's verdict and the live `/admin/duplicates` page.
- Produces: the client knowing the feature exists and how to use it.

- [ ] **Step 1: Send a short status message**

Keep it short and direct, no em dashes, no upselling. Draft:

```
The duplicate detection is live. It cleaned up about 25,000 repeated
listings that had built up, and the site now shows one listing per event
instead of the same one three or four times.

There are 107 pairs it wasn't confident about, so it left those for you to
decide. They're under Duplicates in the admin. For each one you pick which
to keep, or say they're not duplicates. Anything hidden can be restored.

It now runs automatically every night.
```

- [ ] **Step 2: Offer the `--fuzzy` pass as a separate, explicit choice**

Explain the tradeoff in one line: it finds the same event posted by two
different accounts, and would add about 3,600 more pairs to review. It hides
nothing on its own. Only run it if the client says yes:

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && /home/ubuntu/misc/preflight.sh && \
   OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates --fuzzy'
```

- [ ] **Step 3: Log hours honestly**

Cap is 10h/week. Descriptions max 130 characters, no dates, no upselling.
Never log past the cap.

---

### Task 7b: Follow-ups surfaced by the client's spot-check questions (2026-08-26)

**Files:**
- Modify: `API/API/event/management/commands/detect_duplicates.py:27-32` (`COMPLETENESS_FIELDS` / `completeness`)
- Modify: `API/API/event/views.py:971-1005` (`get_duplicate_events`) and `FE/pages/admin/duplicates/index.tsx` (flagged tab)

**Interfaces:**
- Consumes: `completeness(event) -> int` used by `canonical = max(rows, key=completeness)`.
- Produces: a keeper choice that never prefers a dateless row over a dated twin; a way for the owner to browse collapsed rows.

- [ ] **Item 1: Weight the keeper choice toward dated and titled rows**

Verified on production: in 5 of 25,192 collapses (1 upcoming: hidden #73564 dated
2026-10-01, keeper #73561 undated; both blank, both `is_event=False`) the row
with a date was hidden because the undated twin had more filled fields overall.
No real listing was lost, but the picker should not be able to do this. Change
`completeness` so `start_date` and `name` each count 3 and other fields 1:

```python
WEIGHTS = {'name': 3, 'start_date': 3}

def completeness(event):
    return sum(WEIGHTS.get(f, 1) for f in COMPLETENESS_FIELDS if getattr(event, f, None))
```

Add a test in `event/tests.py` asserting a dated-but-sparse row beats an undated
row with two extra fields. Since `--exact` uses `get_or_create` on the pair,
re-running the command does NOT re-pick existing keepers; fixing the 5 existing
cases (if wanted) is a one-off swap of `canonical`/`suppressed` between the two
rows, done by hand after the code change.

- [ ] **Item 2: Let the owner browse the collapsed rows (only if he asks)**

`get_duplicate_events` scopes the "Previously flagged" tab to
`canonical__isnull=True` (2,356 rows) so genuinely-restorable rows are not
buried under 25k re-scrape husks. The owner asked to spot-check the 25k, which
that tab cannot show. If he wants it: add a `?collapsed=1` query flag that flips
the filter to `canonical__isnull=False`, and a third tab "Collapsed by the
nightly run" in `duplicates/index.tsx` reusing the existing Restore button.
About one hour. Do not build unasked.

---

### Task 7c: DEFERRED by the client — cross-post auto-merge (2026-08-26)

The owner asked for the cross-post pass to auto-resolve ("keep the post with
the most information, delete the rest") rather than queue, then chose to hold
off and revisit later. **Do not build this unless he asks again.** The
measurement below is the expensive part and is already done — reuse it.

**Measured on live production data (2026-08-26), pairs at/above threshold 82:**

| score band | pairs | exact same day | upcoming | safe to auto-merge? |
|---|---|---|---|---|
| 95-100 | 1,290 | 1,236 | 159 | yes, if the date matches exactly |
| 90-95 | 238 | 221 | 15 | borderline, queue it |
| 82-90 | 885 | 690 | 46 | no |

Total 2,413 (down from the 3,610 measured before the exact pass ran, since
that pass removed one side of many pairs).

**Why the 82-90 band must never auto-merge — real examples pulled from prod:**
- `Paga lo que puedas` @ Outline vs `Come lo que Quieras, Paga lo que Puedas`
  @ Mamma Ricotta, same day: a citywide pay-what-you-can day at DIFFERENT
  venues. Merging hides one restaurant's event.
- `Studio Barnhus` @ The Bridge Sep 5 vs @ Funk Club Sep 4: two different shows.
- `LADW3` Sep 29 vs Sep 30 scored **100**: a multi-day event. The +/-1 day
  window that is correct for nightlife crossing midnight is WRONG for
  auto-deletion, even at a perfect title score.

**If it is ever built (~3-3.5h), the shape is:**
1. Auto-suppress only when `score >= 95 AND a['date'] == b['date']` (exact day,
   not the +/-1 window). Everything else keeps going to the review queue.
2. Suppress, never delete — and this REQUIRES making auto-merged rows visible
   in the recovery tab first (see Task 7b item 2), because
   `get_duplicate_events` filters `canonical__isnull=True` and would otherwise
   leave the owner no way to undo a bad auto-merge.
3. Land the keeper-weighting fix (Task 7b item 1) FIRST — "keep the one with
   the most information" is precisely the rule being automated, and today the
   picker can prefer an undated row over a dated one.
4. This is new scope beyond the agreed 28 hours; agree billing before starting.

---

### Task 8: Security backlog (separate engagement — do not start without approval)

These are pre-existing risks found during the audit, not regressions from this
work. They are listed so they are not forgotten. Each needs its own approval
because each can take the site down.

**Files:**
- `API/API/c_auth/authentication.py` (JWT signing key)
- `API/API/c_admin/constants.py` (hardcoded credentials)

- [ ] **Item 1: JWT signing key is the literal string `'secret'`**

Anyone can forge an admin token. Rotating it invalidates every existing
session and must be coordinated with the client.

- [ ] **Item 2: The repository is public and contains live credentials**

Instagram, Apify, Firebase and OpenAI values are in git history. Rotating
them requires updating the server's `.env.local` in the same window, and the
`dummy_` admin password additionally gates ingestion via `get_headers()`, so
changing it alone breaks the nightly scrape.

- [ ] **Item 3: The AWS access key shared over chat should be rotated**

- [ ] **Item 4: No Elastic IP**

Any instance stop changes the public IP and takes DNS down. Attaching one
requires a DNS change at Bluehost and a brief coordinated window.

- [ ] **Item 5: `is_duplicate` and `suppressed` are dual-written**

Known debt from Ticket 1: `suppressed` is the real flag, `is_duplicate` is
kept in sync so legacy read paths still hide rows. Unify to one field when
there is a reason to touch that code again.
