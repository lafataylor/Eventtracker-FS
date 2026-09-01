# Cross-post duplicates: close the title gap + turn the merge on — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate rows the owner is seeing (screenshot: four `adiosclosetbazar` cards, same bazaar, same Fri Sep 4, same Tonalá 308 address), by closing the one gap that makes them unmatchable and then running the merge he already approved.

## The diagnosis (measured on production, 2026-09-01)

His four cards come from **four different Instagram posts** (`DbwsbnZxYD0`, `DcSIsvNkax3`, `DcfGhcXkUi7`, `DckOIoQkT1V`) published over 11 days — one account re-promoting one recurring bazaar. Neither existing pass can touch them:

- `--exact` only groups rows that share a **shortcode**. Different posts, so out of scope. (It IS working: within each of those posts the extra copies are already collapsed — 73655/73657/73659 and 77102-77106 are hidden.)
- `--fuzzy` calls `score_pair`, which opens with a hard gate: `if not (a['name'] and b['name']): return 0.0`. **Every one of these rows has a null name**, so the pair scores 0 and is never even queued.

Scale of the gap among visible upcoming events (1,091 rows, grouped by same poster + same date + same venue address):

| cluster kind | redundant rows | reachable by fuzzy today? |
|---|---|---|
| all named | 90 | yes — but fuzzy only QUEUES, and the cron runs `--exact` only |
| mixed named/nameless | 34 | **no** — the both-names gate returns 0 |
| all nameless | 5 | **no** — same gate |

**129 redundant rows total.** 68 are purely legacy-era rows and 61 involve a row created since structured extraction went live, so this is mostly a long-standing gap that got more visible as nightly volume rose (180 rows/night legacy → 497 on Aug 31), not a regression the new extractor introduced. Worth telling him plainly.

**Architecture:** one narrow fallback inside `score_pair` for the nameless case, anchored on an identity tight enough to assert without a title — same posting account, same exact date, and a matching venue. Then run the already-approved `--auto-merge-threshold 95` and add it to the nightly cron.

**Tech Stack:** `API/API/event/dedupe.py`, `detect_duplicates`, rapidfuzz (already a dependency), EC2 cron.

## Global Constraints
- Mutation window 03:00–20:30 UTC; run `/home/ubuntu/misc/preflight.sh` (age-based since 2026-09-01) before server changes; never stop the instance; sync `server-api` from `HEAD:API/API`.
- Dedupe rule of the house: a false "distinct" only costs a review, a false "redundant" hides a real event. Every new rule fails toward keeping.
- Nothing hides on production until a `--dry-run` has printed the counts first.
- Owner already approved the merge and asked that it run automatically thereafter.

---

### Task 1: venue-anchored fallback for nameless pairs

**Files:**
- Modify: `API/API/event/dedupe.py` (`event_signature`, `score_pair`)
- Test: `API/API/event/test_detect_duplicates.py` (append `NamelessVenueAnchorTests`)

**Interfaces:**
- `event_signature(event)` gains `poster` (the Account id) and keeps existing keys unchanged.
- `score_pair(a, b)` returns `VENUE_ANCHOR_SCORE` for a pair that has no title on at least one side but satisfies the anchor; every other nameless pair still returns `0.0`.

Addresses for one venue are NOT byte-identical — the four real rows read `'Tonalá 308 Eoma Sur'`, `'Tonalá 308, Roma Sur, Mexico'`, `'Tonalá 308 Roma sur, Mexico City, Mexico'` — so compare with the existing normalised `venue` signature via `token_set_ratio`, never `==`.

- [ ] **Step 1: failing tests.**

```python
class NamelessVenueAnchorTests(TestCase):
    """The owner's 2026-09-01 screenshot: one account re-promoting one bazaar
    across four posts, every row untitled, so score_pair's both-names gate
    scored them 0 and they all stayed visible."""

    def _sig(self, **kw):
        base = dict(id=1, name='', artist='', venue='', date=None, poster=None)
        base.update(kw)
        return base

    def test_nameless_same_account_date_and_venue_is_a_duplicate(self):
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308 eoma sur')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308, roma sur, mexico')
        self.assertGreaterEqual(score_pair(a, b), FUZZY_THRESHOLD)

    def test_named_beside_nameless_at_the_same_venue_matches(self):
        # the 34-row "mixed" bucket; completeness makes the NAMED row the keeper
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), name='bazar',
                      venue='tonala 308, roma sur')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4),
                      venue='tonala 308, roma sur')
        self.assertGreaterEqual(score_pair(a, b), FUZZY_THRESHOLD)

    def test_different_accounts_do_not_anchor(self):
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='same place')
        b = self._sig(id=2, poster=9, date=date(2026, 9, 4), venue='same place')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_different_days_do_not_anchor(self):
        # ±1 day is fine for titled nightlife; with no title it is not evidence
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='same place')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 5), venue='same place')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_different_venues_do_not_anchor(self):
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='club gretchen')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4), venue='foro indie rocks')
        self.assertEqual(score_pair(a, b), 0.0)

    def test_missing_venue_never_anchors(self):
        from datetime import date
        a = self._sig(id=1, poster=7, date=date(2026, 9, 4), venue='')
        b = self._sig(id=2, poster=7, date=date(2026, 9, 4), venue='')
        self.assertEqual(score_pair(a, b), 0.0)
```

- [ ] **Step 2: run red** — the both-names gate returns 0.0 for all six.
- [ ] **Step 3: implement.** In `event_signature` add `'poster': event.poster_id`. In `score_pair` replace the bare gate:

```python
VENUE_ANCHOR_SIM = 85.0     # address spellings drift; compare, never equate
VENUE_ANCHOR_SCORE = 95.0   # same account + same day + same venue

    if not (a['name'] and b['name']):
        # No title on at least one side. A title is normally the only thing
        # strong enough to assert "same event", but one account re-promoting
        # one event across several posts is the commonest duplicate that gate
        # misses (measured 2026-09-01: 39 of 129 redundant visible rows, and
        # the owner's four-card bazaar screenshot). Anchor on an identity that
        # does not need a title: SAME account, SAME exact date, same venue.
        # Deliberately stricter than the titled path, which tolerates +/-1 day
        # and cross-account matches - with no title there is nothing to fall
        # back on if the anchor is wrong.
        if (a['poster'] and a['poster'] == b['poster']
                and a['date'] and a['date'] == b['date']
                and a['venue'] and b['venue']
                and fuzz.token_set_ratio(a['venue'], b['venue']) >= VENUE_ANCHOR_SIM):
            return VENUE_ANCHOR_SCORE
        return 0.0
```

- [ ] **Step 4:** full suite green (`python manage.py test`), unfiltered.
- [ ] **Step 5:** commit; sync `server-api`; `deploy_api.sh --dry-run` then deploy in-window.

### Task 2: dry-run, then run the approved merge, then automate it

Owner 2026-09-01: "Yes good to run it, is there a way that this will happen automatically in the future?"

**Files (server):** `/home/ubuntu/EventTracker-API/API/run_dedupe.sh` (the copy crontab runs at 03:37 UTC; currently `--exact` only — this is why cross-post duplicates were never even queued). The `/home/ubuntu/misc/run_dedupe.sh` copy is stale and runs nothing; reconcile or delete it.

- [ ] **Step 1: dry-run first, record the numbers.**
```bash
cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=unused-by-this-command \
  /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates \
  --fuzzy --auto-merge-threshold 95 --dry-run 2>&1 | tail -4
```
Baseline before Task 1 was 988 would-merge / 1,288 would-queue; expect the merge count to rise by roughly the nameless clusters. If it rises by far more than ~150, STOP and investigate before running for real.
- [ ] **Step 2: run it attended, in-window, after preflight.** Same command without `--dry-run`.
- [ ] **Step 3: invariants.**
```python
Event.objects.filter(suppressed=True, canonical__isnull=True).count()      # == 0
Event.objects.filter(suppressed=True, canonical__suppressed=True).count()  # == 0 (no chains)
```
Plus: the four `adiosclosetbazar` Sep-4 rows collapse to one; every city page still renders; spot-check 3 merges in the admin "Hidden as duplicates" scope and confirm each names a sensible keeper.
- [ ] **Step 4: automate.** Edit the CRON copy: `detect_duplicates --exact` → `detect_duplicates --exact --fuzzy --auto-merge-threshold 95`. Verify with a `--dry-run` invocation of the edited script that it parses.
- [ ] **Step 5: tell the owner** it now runs nightly, and that the queue holds the less-certain pairs for his review with the bulk tools.

## Execution record
- 2026-09-01: written after the owner's four-card screenshot. Diagnosis measured, not assumed.

## Execution record (2026-09-01 evening)
- **Task 1 DONE + DEPLOYED**, but reshaped by an adversarial review that ran
  the anchor against the production snapshot. First version scored anchored
  pairs 95.0 = the auto-merge bar, so 453 pairs would have merged unattended
  nightly; 183 of them (40%) were ambiguous — Zinco Jazz Club ran SIX distinct
  concerts at Motolinía 20 on 2025-02-01 and one untitled row anchored equally
  to all six, with id order deciding which concert it vanished behind. It also
  fired on two venues sharing one building ('Departamento'/'PB' at Álvaro
  Obregón 154; 'ESSEX CLUB'/'NightClub' at Londres 195), and `\d+` was
  matching Berlin postcodes and years in venue names. Worst of all, 4 of 5
  mutations survived my own tests, because every negative case used a
  digit-free venue and was rejected by the number gate no matter what.
  Fixed (e77b504): score 95 -> 90 so anchored pairs QUEUE instead of merging;
  venue NAME kept as its own signature key and required to agree; digit runs
  filtered to plausible house numbers and compared by intersection; negative
  tests rewritten with matching street numbers. 158 tests, and each gate is
  now mutation-proven (removing the account gate, number gate, venue-name
  gate, zeroing similarity, or restoring score 95 each fails the suite).
- **Task 2 DONE.** Preflight passed (12h54m idle). Attended run: **988
  auto-merged, 1,720 queued** — merges exactly the confidently-titled set the
  owner approved, unchanged by the anchor work. Invariants clean: 0 suppressed
  rows without a canonical, 0 canonical chains. Visible upcoming events
  1,091 -> 1,017. Site verified rendering after the merge. Cron now runs
  `--exact --fuzzy --auto-merge-threshold 95` nightly at 03:37 UTC (backup:
  /home/ubuntu/misc/run_dedupe.sh.bak-20260901), verified by running the
  edited script end-to-end in dry-run. Also fixed a latent bug in that script:
  `echo "exit=$?"` reported grep's status, so a dedupe that died logged
  exit=0; now uses `${PIPESTATUS[0]}`. Stale header comment rewritten.
- **KNOWN, needs a decision:** the owner's four adiosclosetbazar Sep-4 cards
  are still visible. They are untitled cross-post duplicates, so they now sit
  in his review queue rather than hiding themselves. Clearing them
  automatically needs the reviewer's ambiguity guard — merge an untitled row
  only when it anchors to exactly ONE partner in its account+date+venue group
  (Zinco's row anchors to six, so it would stay queued). Measured to leave
  ~26 auto-merges instead of 453. NOT built: it adds another unattended
  hiding path to the nightly job, and today already shipped an outage fix, a
  type change, a preflight rewrite, a new matcher and a 988-row merge.
