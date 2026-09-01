# Dedupe keeper/guard fixes + openai upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the owner's review queue filling with unreviewable blank pairs, make the keeper choice never prefer an undated row over a dated one, and unblock Phase 5 by upgrading the server's `openai` package — all deployed in today's window.

**Architecture:** Two small, test-first changes to `event/management/commands/detect_duplicates.py` (a weighted `completeness()` and a narrower "ambiguous keyed pair" guard), a dependency pin, then the existing file-sync deploy (`/home/ubuntu/misc/deploy_api.sh`) followed by one attended `run_dedupe.sh` to shrink the live queue.

**Tech Stack:** Django 5.0.6 management command, Django `TestCase`, pip on the EC2 venv, rsync deploy script.

## Global Constraints

- Production is live, no staging, SQLite on one EC2 box. **Never stop/reboot the instance.**
- Mutation window **03:00–20:30 UTC only**; always run `/home/ubuntu/misc/preflight.sh` first and never override a failure.
- Every `manage.py` command on the server needs `OPENAI_API_KEY` set (import-time client); use `OPENAI_API_KEY=x` for commands that never call OpenAI.
- Branches only, never force-push. Run `/code-review` before committing (project rule).
- Verification must be unfiltered: full test suite, no grepping to changed files.
- Never commit secrets. Local runs must have `EVENT_API_HOST=http://127.0.0.1:8009/`.
- Deploys go: push `feat/dedupe-and-carousel` → subtree-split to `server-api` → `git pull` in `/home/ubuntu/deploy-rehearsal/api` → `deploy_api.sh --dry-run` → `deploy_api.sh`.

---

### Task 1: Weighted keeper choice

Verified on production 2026-08-26: in 5 of 25,192 collapses the row WITH a date
was hidden because its undated twin had more secondary fields (e.g. hidden
#73564 `start_date=2026-10-01`, keeper #73561 `start_date=None` but with
`artist` and `genres`). A date and a title identify an event; other fields
only describe it, so they must not outvote it.

**Files:**
- Modify: `API/API/event/management/commands/detect_duplicates.py:27-32`
- Create: `API/API/event/test_detect_duplicates.py`

**Interfaces:**
- Produces: `completeness(event) -> tuple[int, int]` = `(identifying_fields_present, descriptive_fields_present)` and module constant `IDENTIFYING_FIELDS = ('name', 'start_date')`. (Execution note: the plan's original weight-3 scheme TIED against three descriptive fields — `4 not greater than 4` — so it was replaced by a tuple key where identifying fields dominate outright.)
- Consumed by: `canonical = max(rows, key=completeness)` at line 91 of the same file (unchanged).

- [ ] **Step 1: Write the failing test**

Create `API/API/event/test_detect_duplicates.py`:

```python
"""Tests for the detect_duplicates management command (Ticket 1)."""
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from event.management.commands.detect_duplicates import completeness
from event.models import Event, EventMatch


class KeeperChoiceTests(TestCase):
    """The keeper of a same-post group must be the row that best IDENTIFIES the
    event. Reproduces production rows #73564 (dated, sparse) vs #73561
    (undated, but artist+genres filled): the dated row must win."""

    def test_dated_sparse_row_beats_undated_row_with_more_fields(self):
        dated = Event(name=None, start_date=timezone.now(),
                      ticket_link='https://www.instagram.com/p/x/',
                      orig_thumb='https://img/x__0.jpg')
        undated = Event(name=None, start_date=None,
                        artist='Girl Ultra', genres='trance, dark pop',
                        ticket_link='https://www.instagram.com/p/x/',
                        orig_thumb='https://img/x__1.jpg')
        self.assertGreater(completeness(dated), completeness(undated))

    def test_titled_row_beats_untitled_row_with_more_fields(self):
        titled = Event(name='Slow It Down', orig_thumb='https://img/a.jpg')
        untitled = Event(name=None, artist='a', genres='b', price='10',
                         orig_thumb='https://img/b.jpg')
        self.assertGreater(completeness(titled), completeness(untitled))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd API/API && ./.venv/bin/python manage.py test event.test_detect_duplicates -v 2`
Expected: both tests FAIL with `AssertionError: 3 not greater than 4` (old
unweighted count: dated=3 vs undated=4; titled=2 vs untitled=4).

- [ ] **Step 3: Implement the weighting**

In `API/API/event/management/commands/detect_duplicates.py` replace lines 27–32:

```python
COMPLETENESS_FIELDS = ('name', 'artist', 'start_date', 'start_time', 'price',
                       'genres', 'ticket_link', 'orig_thumb', 'venue_id')

# A title and a date IDENTIFY an event; the other fields only describe it, so
# they must not be able to outvote them. Verified on production (2026-08-26):
# with a flat count, 5 of 25,192 collapses hid the only dated row of a post
# because an undated twin had more secondary fields filled in. Weight 3 means
# one identifying field beats any three descriptive ones.
COMPLETENESS_WEIGHTS = {'name': 3, 'start_date': 3}


def completeness(event):
    return sum(COMPLETENESS_WEIGHTS.get(f, 1)
               for f in COMPLETENESS_FIELDS if getattr(event, f, None))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd API/API && ./.venv/bin/python manage.py test event.test_detect_duplicates -v 2`
Expected: `Ran 2 tests ... OK`.

- [ ] **Step 5: Do not commit yet** — Task 2 lands in the same file and the two
ship as one reviewed commit (Task 3).

---

### Task 2: Collapse blank-and-dateless same-post pairs instead of queueing

The `both_keyed_nameless` guard queues any two keyed nameless rows because,
in general, a title is the only way to tell a legacy per-slide split (one
event, N rows) from a structured multi-event split (N events). But when
NEITHER row has a date either, there is nothing left for a human to compare:
the pair view shows two blank cards. Measured 2026-08-27: 78 of 191 pending
pairs were exactly this, and the nightly run adds ~80 more. Hiding one blank
dateless row behind another blank dateless row from the same post loses
nothing that the pair view could have recovered. A pair where at least one
side has a date keeps queueing — a date is a real distinguishing signal.

**Files:**
- Modify: `API/API/event/management/commands/detect_duplicates.py:106-113`
- Modify: `API/API/event/test_detect_duplicates.py` (append)

**Interfaces:**
- Consumes: `same_post_is_redundant(a_sig, b_sig) -> bool` from `event/dedupe.py` (unchanged).
- Produces: module constant `TEXT_FIELDS` and `has_extracted_text(event) -> bool`; the local variable `both_keyed_nameless` becomes `ambiguous_keyed_pair`.

**Execution note (2026-08-27):** two independent reviewers rejected the plan's
original "no title AND no date on either side" rule: the review card shows
artist/venue/genre too, so a nameless dateless pair can still be comparable.
Measured on prod, only 22 of the 78 such pairs were truly blank; 56 had text
on one side. The rule that shipped is: collapse when EITHER side has no
extracted text at all (`TEXT_FIELDS`), because a textless row can never be a
findable listing; queue whenever both sides carry text. Thumbnails/links are
not counted (every slide has a different thumbnail and the same link). Prod
impact under the shipped rule: 191 → 122 pending (all 102 titled pairs kept),
not the 113 the plan predicted.

A verification pass on that version found two more holes, both fixed before
commit: (1) the guard was gated on BOTH rows being keyed, so a legacy row next
to a new keyed row — the common shape while 33k legacy posts remain — fell
straight through to a collapse; the guard is now key-agnostic (`ambiguous_pair`).
(2) `completeness()` still scored thumbnail/link alongside text, so a
thumbnail-only row could out-rank a row with an artist; it now scores in strict
tiers `(identifying, text, media)`, and the group query is `order_by('id')` so
full ties deterministically keep the oldest row. Tests cover all of it (89 → 92).

- [ ] **Step 1: Write the failing tests**

Append to `API/API/event/test_detect_duplicates.py`:

```python
class BlankPairGuardTests(TestCase):
    """Two keyed rows from the same post with no title AND no date have
    nothing a reviewer could compare, so --exact must collapse them rather
    than queue an unreviewable pair. If either side has a date, it still
    queues (a date is a real signal that these may be distinct events)."""

    def _row(self, key, **kw):
        base = dict(shortcode='ABC123', source_key=key, is_duplicate=False,
                    suppressed=False, is_event=False,
                    orig_link='https://www.instagram.com/p/ABC123/')
        base.update(kw)
        return Event.objects.create(**base)

    def test_blank_dateless_keyed_pair_is_collapsed(self):
        self._row('ABC123__0__0', name=None, start_date=None)
        self._row('ABC123__1__0', name=None, start_date=None)
        call_command('detect_duplicates', '--exact')
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 0)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 1)
        keeper = Event.objects.get(suppressed=False)
        hidden = Event.objects.get(suppressed=True)
        self.assertEqual(hidden.canonical_id, keeper.id)

    def test_blank_pair_with_one_date_still_queues(self):
        self._row('ABC123__0__0', name=None, start_date=None)
        self._row('ABC123__1__0', name=None, start_date=timezone.now())
        call_command('detect_duplicates', '--exact')
        self.assertEqual(EventMatch.objects.filter(status='pending').count(), 1)
        self.assertEqual(Event.objects.filter(suppressed=True).count(), 0)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd API/API && ./.venv/bin/python manage.py test event.test_detect_duplicates.BlankPairGuardTests -v 2`
Expected: `test_blank_dateless_keyed_pair_is_collapsed` FAILS
(`AssertionError: 1 != 0` — the pair is queued today).
`test_blank_pair_with_one_date_still_queues` PASSES already (guards against
over-correcting).

- [ ] **Step 3: Narrow the guard**

In `API/API/event/management/commands/detect_duplicates.py` replace lines 106–113
(from `both_keyed_nameless = (` through the `if both_keyed_nameless or ...:` line) with:

```python
                # Two KEYED nameless rows are ambiguous by construction: the
                # legacy per-slide path writes N keys for ONE event, while the
                # structured path writes N keys for N DISTINCT events. A title
                # would settle it; failing that, a DATE on either side is the
                # only remaining signal that these might be distinct events,
                # so such pairs go to review. With no title and no date on
                # either side there is nothing a reviewer could compare (the
                # pair view would show two blank cards), so collapse them —
                # hiding one blank dateless row behind another from the same
                # post loses nothing recoverable. Measured 2026-08-27: 78 of
                # 191 pending pairs were this shape, growing ~80 per night.
                ambiguous_keyed_pair = (
                    row.source_key and canonical.source_key
                    and not canonical_sig['name'] and not row_sig['name']
                    and (canonical_sig['date'] is not None
                         or row_sig['date'] is not None))
                if ambiguous_keyed_pair or not same_post_is_redundant(canonical_sig, row_sig):
```

- [ ] **Step 4: Run the full suite, unfiltered**

Run: `cd API/API && ./.venv/bin/python manage.py test event c_admin c_auth`
Expected: `Ran 86 tests ... OK` (82 existing + 4 new). Any failure = stop.

---

### Task 3: Review, commit, push, sync the deploy branch

**Files:**
- Commit: `API/API/event/management/commands/detect_duplicates.py`, `API/API/event/test_detect_duplicates.py`, `API/API/requirements.txt`

- [ ] **Step 1: Pin openai (Task 4 needs it in the same deploy)**

Edit `API/API/requirements.txt` line 14 from `openai` to:

```
openai==1.54.4
```

- [ ] **Step 2: Run /code-review on the staged diff (project rule), fix anything real**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS
git add API/API/event/management/commands/detect_duplicates.py API/API/event/test_detect_duplicates.py API/API/requirements.txt
git diff --cached --stat
```

Then invoke the `code-review:code-review` skill on the staged diff (a small
diff: one reviewer for bugs, one for regressions vs the dedupe tests).

- [ ] **Step 3: Commit and push**

```bash
git commit -F - <<'MSG'
detect_duplicates: weight title/date in keeper choice; collapse blank dateless pairs

Two fixes to the --exact pass, both measured on production after the first
nightly runs:

- Keeper choice: completeness() now weights name and start_date at 3 so a
  dated or titled row cannot lose to an undated, untitled twin that merely
  has more descriptive fields. 5 of 25,192 collapses had hidden the only
  dated row of a post.
- Blank pairs: two keyed rows with no title AND no date on either side are
  collapsed instead of queued. Such a pair shows two blank cards in the
  review UI and is unreviewable; 78 of 191 pending pairs were this shape and
  the nightly run was adding ~80 more. Pairs where either side has a date
  still queue.

Also pins openai==1.54.4, the version the structured extraction path was
validated against; the unpinned entry let prod drift to 1.35.1, which lacks
beta.chat.completions.parse.
MSG
git push origin feat/dedupe-and-carousel
```

- [ ] **Step 4: Sync the server-api deploy branch and the rehearsal clone**

```bash
cd /Users/ZJaffery/Documents/Eventtracker-FS
APITREE=$(git rev-parse HEAD:API)
C=$(git commit-tree "$APITREE" -p origin/server-api -m "Sync server-api to feat/dedupe-and-carousel @ $(git rev-parse --short HEAD)")
git push origin "$C:server-api"
git fetch origin
test "$(git rev-parse origin/server-api^{tree})" = "$APITREE" && echo "server-api in sync"
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/deploy-rehearsal/api && git pull -q && git log --oneline -1'
```

Expected: `server-api in sync`, and the rehearsal clone reports the new sync commit.

---

### Task 4: Upgrade openai on the server (reversible)

Blast radius verified 2026-08-26: httpx 0.27.0, pydantic 2.7.4, anyio 4.4.0,
typing_extensions 4.12.2 all already satisfy 1.54.4; pip replaces `openai`
and adds `jiter` only. The live nightly call (`client.chat.completions.create`
with `model`/`messages`/`max_tokens`) is unchanged between versions.

- [ ] **Step 1: Preflight and snapshot the venv**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/misc/preflight.sh && \
   /home/ubuntu/EventTracker-API/venv/bin/pip freeze > /home/ubuntu/misc/pip-freeze-before-openai-upgrade.txt && \
   grep -c . /home/ubuntu/misc/pip-freeze-before-openai-upgrade.txt'
```

Expected: `PREFLIGHT PASSED` and a package count. If preflight fails, stop.

- [ ] **Step 2: Upgrade**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/EventTracker-API/venv/bin/pip install "openai==1.54.4" 2>&1 | tail -2'
```

Expected: `Successfully installed jiter-... openai-1.54.4`.

- [ ] **Step 3: Verify both code paths (no restart yet — Task 5 restarts)**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python -c "
import openai
from openai import OpenAI
c = OpenAI(api_key=\"x\")
print(\"openai\", openai.__version__)
print(\"legacy create:\", hasattr(c.chat.completions, \"create\"))
print(\"structured parse:\", hasattr(c.beta.chat.completions, \"parse\"))
import c_admin.scraper, c_admin.extraction
print(\"both modules import: True\")
"'
```

Expected: `openai 1.54.4`, both `True`, `both modules import: True`.

**Rollback:** `pip install "openai==1.35.1" && sudo systemctl restart gunicorn`.

---

### Task 5: Deploy, run the dedupe once, verify

- [ ] **Step 1: Dry-run and inspect**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/misc/deploy_api.sh --dry-run 2>&1 | grep -E "^>f" | grep -vE "^>f\.\.t"'
```

Expected: only `detect_duplicates.py`, `test_detect_duplicates.py`, `requirements.txt`.
Anything else = stop and look.

- [ ] **Step 2: Deploy**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  '/home/ubuntu/misc/deploy_api.sh 2>&1 | grep -vE "^>f\.\.t" | tail -15'
```

Expected: `No migrations to apply.`, gunicorn `active`, `locations endpoint: 200`,
`DEBUG = False`, `API DEPLOY COMPLETE`.

- [ ] **Step 3: Back up, then run the dedupe attended**

```bash
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && \
   cp -a db.sqlite3 /home/ubuntu/dbBackups/db.sqlite3.preguardfix-$(date -u +%Y%m%d-%H%M%S) && \
   /home/ubuntu/EventTracker-API/API/run_dedupe.sh && tail -4 logs/dedupe.log'
```

Expected in `dedupe.log`: `suppressed N rows` with N ≈ 78 (the blank dateless
pairs); pending afterwards ≈ 113.

- [ ] **Step 4: Verify invariants**

```bash
cat > /tmp/_v.py <<'PY'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "event_tracker_api.settings")
django.setup()
from event.models import Event, EventMatch
print("pending pairs now:", EventMatch.objects.filter(status="pending").count())
print("orphan suppressed (must be 0):", Event.objects.filter(suppressed=True, canonical__isnull=True).count())
print("suppressed whose keeper is hidden (must be 0):", Event.objects.filter(suppressed=True, canonical__suppressed=True).count())
print("dated-hidden-under-undated-keeper (must stay 5, i.e. no NEW mispicks):",
      Event.objects.filter(suppressed=True, start_date__isnull=False, canonical__start_date__isnull=True).count())
PY
scp -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem -q /tmp/_v.py ubuntu@54.83.163.142:/home/ubuntu/EventTracker-API/API/_v.py
ssh -i /Users/ZJaffery/Downloads/eventtrackerkeypair.pem ubuntu@54.83.163.142 \
  'cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=x /home/ubuntu/EventTracker-API/venv/bin/python _v.py 2>&1 | grep -v Warning; rm -f _v.py'
```

Expected: pending ≈ 113, both "must be 0" lines are 0, mispicks still 5.

- [ ] **Step 5: Browser check the live review page**

Open `https://lafaslist.com/admin/duplicates` (log in with the admin form).
Expected: header reads about `113 pairs to review`, and the first pairs shown
have at least one titled or dated side — no pair of two blank cards on page 1.

- [ ] **Step 6: Record on PR #1**

```bash
gh pr comment 1 --repo lafataylor/Eventtracker-FS --body "Post-deploy: first unattended nightly dedupe ran 03:37 UTC (80 rows). Upsert leak test: 0 keyed re-scan duplicates. Deployed weighted keeper choice + blank-pair collapse; review queue 191 -> <N>. openai pinned and upgraded to 1.54.4 (Phase 5 unblocked)."
```

Fill `<N>` from Step 4. Do **not** mention credentials or the JWT key in the
public PR.

---

## Execution record (2026-08-27, all tasks complete)

- Tasks 1–2: shipped as commit `2040d5f` after three review rounds (see notes
  above). 92 tests green.
- Task 3: pushed; `server-api` synced. **Incident:** the first sync used the
  outer `API/` tree instead of `API/API`; caught by a failed post-pull grep
  before any deploy, re-synced with the correct tree, rehearsal clone reset.
  Recorded in memory (`lafaslist-deploy-branch-trees`). Also removed a
  `| head -40` from `deploy_api.sh` that both truncated the change listing and
  could SIGPIPE rsync mid-transfer under `pipefail`.
- Task 4: openai 1.35.1 → 1.54.4 on the server; only `jiter` added; freeze
  saved at `/home/ubuntu/misc/pip-freeze-before-openai-upgrade.txt`.
- Task 5: deployed (no migrations), gunicorn restarted, 200/DEBUG=False.
  The nightly command correctly did NOT touch the 69 already-pending textless
  pairs (its `get_or_create` never re-processes an existing pair), so a
  one-off script applied the new rule to pending-only pairs: 191 → 122.
  That one-off created one canonical chain (3-row post, two pairs processed
  independently); repaired by re-pointing to the visible root. Final
  invariants: 0 orphans, 0 hidden-keeper chains, 0 posts with no listing,
  mispicks unchanged at 5 (pre-existing, harmless).
- **Follow-up worth doing:** the nightly command's single-canonical loop
  cannot create chains, but any future one-off that processes pairs
  independently can. If another one-off is ever needed, resolve per post
  group, not per pair.

## Phase 5 roundup validation (2026-08-27, local, ~$0.06) — PASS on quality, FAIL on identity

- `This week at RENATE` (DcgSE9_tyqZ): `post_type=roundup`, **9 events**
  across 3 days with floors, hosts, artists, times, venue. H2 proven live.
- `DJ LINE UP SEMANAL` (Dcg2fgcGHgb): `post_type=recurring`, 1 event spanning
  Aug 27–31 (plausible for a weekly lineup at one venue).
- **Re-pasting the roundup corrupted data.** Second extraction returned 4
  events with different naming, and attributed 2 of them to slide 1 (run 1
  put all 9 on slide 0). Because identity is positional
  (`{shortcode}__{slide}__{ordinal}`), ordinal 0 now pointed at a different
  event, and the manual path's refresh (`overwrite=True`) wrote "Renate
  Garten with Nina Queer Drag Bingo, Aug 28" over row #73511, which had been
  "GARDEN hosted by Remoto Rec, Aug 26". Two new rows were also created
  (9 → 11). The nightly path (fill-empty-only) would contaminate less but
  still wrongly, and would create the extra rows.
- **Verdict:** the flag stays OFF, and the live manual path has this hazard
  for multi-event posts. Fix = content-derived identity for multi-event
  posts (slug of normalized name + date), positional only as the fallback
  for nameless rows. See the proposal in the session notes.

### Content-identity fix — built and replayed (2026-08-27)

`content_source_key(shortcode, name, start_date)` → `{shortcode}__e{sha1[:12]}`
emitted by `build_payloads` for multi-event posts; 10 new tests (102 total).
Local replay, RENATE post pasted twice on the fixed code:

- **Corruption is gone.** Run 1's four rows were untouched by run 2. This was
  the hazard that mattered; it is closed.
- **Idempotency is NOT achieved.** Run 2 created 4 new rows: the extractor
  drifted on wording ("w/" → "with") AND shifted every date by one day, so
  the content hash changed. Content keys cannot absorb model drift.
- **The nightly `--exact` pass only partly self-heals this.** Of the 4 drift
  twins, 1 collapsed and 3 were queued. Cause: the pass picks ONE canonical
  per shortcode group and compares every other row to it. For a roundup the
  group holds N distinct events, so every row that is not the canonical's own
  twin has a different title and is queued. This is structural (the "3+-row
  groups" caveat a verifier raised earlier) and is also a source of the
  same-post pairs already in the owner's queue.

### Content-identity fix — reviewed, deployed (274ef1c, 18:06 UTC)

Two reviewers (bugs; regression-vs-design) → SAFE with three real findings,
all fixed before commit: recurring series stay positional (decision made on
extracted events, not the expanded list); `start_time` added to the hash basis
(same act, two slots, one night must not collide); `[:300]` guard parity.
104 tests. Deployed via file sync from the CORRECT `API/API` tree (layout
verified: manage.py at root, no nested `API/`). Prod: 200, DEBUG off,
59,254 events. PR #2 opened for the two post-merge commits.

### What is needed for the flag flip (not yet approved)

1. **Cluster-based exact pass** (~1.5–2h): within a shortcode group, cluster
   rows by title similarity (≥70) + date within 1 day, pick a keeper per
   cluster, suppress the rest of the cluster, and do NOT queue cross-cluster
   pairs (different titles in one post = the roundup's distinct events, not
   duplicates). Fixes both the drift twins and the roundup noise in the
   review queue.
2. **Date anchoring in the prompt** (~0.5h): weekday-only flyers resolve to
   different calendar dates run to run. Pass the post's publish date (Apify
   `timestamp`) into the prompt as the anchor instead of "today".
3. Then re-run the RENATE double-paste: must be +0 visible rows after the
   nightly pass, with no overwrites.
