# Finish the duplicate cleanup + harden against the next outage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the owner's remaining duplicates disappear without growing his review queue, ship the tour-city rule he asked for, and make sure the next null-data crash is caught by us rather than reported by him.

**Architecture:** Four independent pieces, ordered by what the owner feels. Task 1 finishes yesterday's dedupe work with the ambiguity guard the review recommended, so unambiguous untitled duplicates merge themselves and only genuinely ambiguous ones cost a review. Task 2 validates and ships the served-city filter that is already built and parked. Task 3 finishes the null-safety root cause (the Venue/Poster field types still lie). Task 4 makes a client-side crash visible to us within the hour instead of whenever the owner opens the site.

**Tech Stack:** Django management commands + rapidfuzz (`API/API/event/dedupe.py`), Next.js 13 pages-router, EC2 cron.

## Global Constraints
- Mutation window 03:00–20:30 UTC; run `/home/ubuntu/misc/preflight.sh` before any server change (age-based since 2026-09-01); never stop the instance.
- `server-api` from `HEAD:API/API`, `server-fe` from `HEAD:FE`, as `git commit-tree` snapshots; verify the pushed tree matches before deploying.
- `deploy_fe.sh` consumes `/home/ubuntu/deploy-staging-fe`; recreate it each time (clone `server-fe`, copy `.env.local` from the live FE, put `$HOME/.nvm/versions/node/v20.14.0/bin` on PATH, build with `build.log` ending `=== done`).
- Full unfiltered verification only: whole `manage.py test` run, whole `tsc --noEmit`, whole `npm run build`. Never grep-filter a typecheck.
- Dedupe rule of the house: a false "distinct" costs a review, a false "redundant" hides a real event. Every new rule fails toward keeping.
- Nothing hides on production before a `--dry-run` prints the counts.
- **Main must equal what is deployable.** The served-city work is parked on `feat/served-city-filter` precisely so `main` stays shippable; do not merge it until Task 2's validation passes.

---

### Task 1: ambiguity guard — merge the unambiguous untitled duplicates, queue the rest

Yesterday's review found the venue anchor would auto-merge 453 pairs of which 183 (40%) were ambiguous: Zinco Jazz Club ran six distinct concerts at Motolinía 20 on 2025-02-01 and one untitled row anchored equally to **all six**, so id order decided which concert it vanished behind. The fix was to make every anchored pair queue (score 90, below the 95 bar). That is safe but leaves the owner's four `adiosclosetbazar` Sep-4 cards visible and grew his queue to 1,810 pairs.

The distinction the review identified: an untitled row that anchors to exactly **one** partner has no ambiguity to resolve. The bazaar row matches one; Zinco's row matches six. Measured: the guard leaves ~26 auto-merges instead of 453.

**Files:**
- Modify: `API/API/event/dedupe.py` (extract the anchor predicate)
- Modify: `API/API/event/management/commands/detect_duplicates.py` (`_fuzzy`)
- Test: `API/API/event/test_detect_duplicates.py`

**Interfaces:**
- Produces `venue_anchor_applies(a, b) -> bool` in `dedupe.py`, used by BOTH `score_pair` and the command. The command must not identify anchored pairs by comparing a float to `VENUE_ANCHOR_SCORE`.
- `_fuzzy` gains no new CLI flag: the guard is part of what `--auto-merge-threshold` already means.

- [ ] **Step 1: extract the predicate** so there is one definition of "anchored".

```python
def venue_anchor_applies(a, b):
    """True when an untitled pair may be treated as one event on venue evidence.

    Same posting account, same exact date, a house number shared by both
    addresses, agreeing venue names when both are given, and similar venue
    text. See street_numbers() for why a bare digit run is not a house number.
    """
    if a['name'] and b['name']:
        return False
    nums_a, nums_b = street_numbers(a['venue']), street_numbers(b['venue'])
    name_a, name_b = a.get('venue_name'), b.get('venue_name')
    if (name_a and name_b
            and fuzz.token_set_ratio(name_a, name_b) < VENUE_ANCHOR_NAME_SIM):
        return False
    return bool(
        a['poster'] and a['poster'] == b['poster']
        and a['date'] and a['date'] == b['date']
        and nums_a and nums_b and (nums_a & nums_b)
        and fuzz.token_set_ratio(a['venue'], b['venue']) >= VENUE_ANCHOR_SIM)
```

and in `score_pair`, replace the inline anchor block with:

```python
    if not (a['name'] and b['name']):
        return VENUE_ANCHOR_SCORE if venue_anchor_applies(a, b) else 0.0
```

- [ ] **Step 2: failing tests** for the guard itself.

```python
class AnchorAmbiguityGuardTests(TestCase):
    """One untitled row matching SEVERAL events at one venue on one night is
    ambiguous — Zinco Jazz Club, Motolinía 20, 2025-02-01, six concerts and
    one untitled row that anchored to every one of them. Merging it would pick
    a concert by id order. Only a 1:1 anchor may merge itself."""

    def _row(self, name, day, addr='motolinia 20, centro', poster=None):
        return Event.objects.create(
            name=name, start_date=timezone.now() + timedelta(days=day),
            poster=poster, venue=Venue.objects.create(address=addr),
            is_event=True, is_duplicate=False, suppressed=False)

    def test_untitled_row_matching_two_events_is_queued_not_merged(self):
        acct = Account.objects.create(user='zincojazz')
        self._row('bravo brubeck', 3, poster=acct)
        self._row('bossa e foda', 3, poster=acct)
        self._row(None, 3, poster=acct)
        call_command('detect_duplicates', '--fuzzy',
                     '--auto-merge-threshold', '95')
        self.assertFalse(Event.objects.filter(suppressed=True).exists())
        self.assertGreaterEqual(
            EventMatch.objects.filter(status='pending').count(), 2)

    def test_untitled_row_matching_exactly_one_event_is_merged(self):
        acct = Account.objects.create(user='adiosclosetbazar')
        keeper = self._row('bazar', 3, addr='tonala 308, roma sur', poster=acct)
        loser = self._row(None, 3, addr='tonala 308, roma sur, mexico',
                          poster=acct)
        call_command('detect_duplicates', '--fuzzy',
                     '--auto-merge-threshold', '95')
        loser.refresh_from_db(); keeper.refresh_from_db()
        self.assertTrue(loser.suppressed)
        self.assertEqual(loser.canonical_id, keeper.id)
        self.assertFalse(keeper.suppressed)

    def test_two_untitled_rows_alone_at_a_venue_merge(self):
        # the owner's bazaar shape: both sides untitled, nothing else there
        acct = Account.objects.create(user='adiosclosetbazar')
        a = self._row(None, 3, addr='tonala 308, roma sur', poster=acct)
        b = self._row(None, 3, addr='tonala 308 roma sur, cdmx', poster=acct)
        call_command('detect_duplicates', '--fuzzy',
                     '--auto-merge-threshold', '95')
        a.refresh_from_db(); b.refresh_from_db()
        self.assertEqual([a.suppressed, b.suppressed].count(True), 1)
```

- [ ] **Step 3: run red.** All three fail today: nothing merges, because anchored pairs score 90.
- [ ] **Step 4: implement in `_fuzzy`.** Materialise the candidate list once, count each row's anchor partners, then let a 1:1 anchored pair clear the merge bar:

```python
        from collections import defaultdict
        from event.dedupe import venue_anchor_applies

        sig_by_id = {s['id']: s for s in signatures}
        candidates = []
        for lo, hi, score in find_fuzzy_pairs(signatures):
            if sc.get(lo) and sc.get(lo) == sc.get(hi):
                continue          # same post — handled by --exact
            candidates.append((lo, hi, score))

        # How many partners each row anchors to. A row that anchors to several
        # events at one venue on one night is ambiguous: merging it would pick
        # one by id order (measured 2026-09-01: 183 of 453 anchored pairs).
        anchor_partners = defaultdict(set)
        for lo, hi, _ in candidates:
            if venue_anchor_applies(sig_by_id[lo], sig_by_id[hi]):
                anchor_partners[lo].add(hi)
                anchor_partners[hi].add(lo)

        def unambiguous_anchor(lo, hi):
            return (venue_anchor_applies(sig_by_id[lo], sig_by_id[hi])
                    and len(anchor_partners[lo]) == 1
                    and len(anchor_partners[hi]) == 1)

        for lo, hi, score in candidates:
            examined += 1
            ...
            auto = (auto_threshold
                    and dates.get(lo) == dates.get(hi)
                    and (score >= auto_threshold or unambiguous_anchor(lo, hi)))
```

Keep every existing guard around `auto` untouched — the rejected/confirmed check, `suppressed_now`, the canonical re-pointing and the keeper's stale-flag cleanup all still apply.

- [ ] **Step 5: full suite green**, unfiltered: `./.venv/bin/python manage.py test`.
- [ ] **Step 6: mutation-test the guard** the way yesterday's tests failed to be tested. Each of these must turn the suite red; if one stays green the test is decorative:

```bash
# 1. guard removed entirely (every anchored pair merges again)
#    replace `or unambiguous_anchor(lo, hi)` with `or True`
# 2. degree check loosened
#    replace `== 1` with `>= 1`
# 3. predicate inverted
#    replace `venue_anchor_applies(...)` with `not venue_anchor_applies(...)`
```

- [ ] **Step 7: commit, sync `server-api`, `deploy_api.sh --dry-run`** and confirm it lists only the two dedupe files, then deploy in-window.
- [ ] **Step 8: dry-run on production and compare against yesterday's numbers.**

```bash
cd /home/ubuntu/EventTracker-API/API && OPENAI_API_KEY=unused-by-this-command \
  /home/ubuntu/EventTracker-API/venv/bin/python manage.py detect_duplicates \
  --fuzzy --auto-merge-threshold 95 --dry-run 2>&1 | tail -4
```
Yesterday: 988 merge / 1,720 queue. Expect the merge count to rise by roughly the number of 1:1 anchors (review measured ~26 on a snapshot; a few dozen is fine) and the queue to fall by about twice that. **If merges rise by more than ~150, STOP** — that means the degree check is not biting.

- [ ] **Step 9: run attended, then verify.**
```python
Event.objects.filter(suppressed=True, canonical__isnull=True).count()      # == 0
Event.objects.filter(suppressed=True, canonical__suppressed=True).count()  # == 0
```
Then confirm the owner's case specifically: of ids 73653 / 75874 / 77107 / 77684 exactly one is left visible, and the survivor is the most complete row. Load `https://lafaslist.com/mexico-city/` and check the four bazaar cards are now one.

### Task 2: validate and ship the served-city filter

Built and tested on `feat/served-city-filter` (commit 7e93b54), deliberately kept off `main`. The extractor classifies each event's metro and only an explicit `OTHER` drops a row; a city-name allowlist was measured and rejected because it would have deleted ~146 real events whose city is a neighbourhood.

**The gate: it has never faced the real model.** The metro field only exists in the prompt and schema; no live extraction has been run to see whether the model populates it sensibly.

**Files:** `API/API/c_admin/extraction.py`, `API/API/c_admin/post_ingest.py` (both already written on the branch).

- [ ] **Step 1: validate against real posts, locally, one call each.** Run the LOCAL API (`API/API`, port 8009) on the local DB copy with `EVENT_API_HOST` pointing at localhost — **without it the manual add writes to PRODUCTION** — then add these by URL and read the `[METRO]` log lines:
  - a genuine multi-city tour post (Molchat Doma is the known example) → expect the non-served stops classified `OTHER` and dropped, the served one kept;
  - a plain local post (any `bar_oriente` event) → expect its metro to be the served city, nothing dropped;
  - a neighbourhood-addressed post (Roma Norte / Seminyak / Neukölln) → expect the metro to be the parent city, **not** `OTHER`.
  Cost is a few cents. If any neighbourhood post comes back `OTHER`, do not ship — tighten the prompt and re-run.
- [ ] **Step 2:** if all three behave, merge `feat/served-city-filter` into `main`, run the full suite, sync `server-api`, dry-run, deploy in-window.
- [ ] **Step 3: morning-after check.** `grep '\[METRO\]' /home/ubuntu/EventTracker-API/API/logs/*.log` for the night's drops; read every dropped title and confirm none belongs to a served city. If a served-city event was dropped, revert the deploy first and debug second.

### Task 3: finish the null-safety root cause — Venue and Poster types

Yesterday widened ten `Event` fields to `string | null`, which surfaced 22 real latent bugs. `Venue` and `Account` were left alone and their types still lie: `venue.address` is NULL on **44,137 of 73,519** rows (60%) and `venue.name`, `city`, `state`, `country` are all nullable, as is `poster.user`. Two live crashes yesterday came from exactly these fields, found by hand rather than by the compiler.

**Files:** `FE/interface/objects/simpleObject.tsx`, plus whatever the compiler points at.

- [ ] **Step 1:** widen `Venue.name/address/city/state/country` and `Poster.user` to `string | null`.
- [ ] **Step 2:** `npx tsc --noEmit`, capture the true error count (`echo $?` on tsc itself, never on a pipe).
- [ ] **Step 3:** fix each error with the minimal guard in that file's existing idiom (`?.`, `?? ''`, a truthy filter before the string method). Do not change rendering for present values. If the count exceeds ~40, stop and report rather than pushing a sprawling diff.
- [ ] **Step 4:** `tsc` rc=0 and a full `npm run build` rc=0; then build against the live API and walk every public page plus `/es`, `/favorites`, an event modal, search, and each filter dropdown, checking the body never contains "Application error".
- [ ] **Step 5:** commit, sync `server-fe`, fresh staging clone + build, deploy in-window, re-walk the five prod pages.

### Task 4: find out about a crash before the owner does

Both of yesterday's crashes were reported by the owner. There is no signal otherwise: the server returns 200 because the failure happens after hydration, so nothing in the logs or the deploy verifier can see it.

**Files:** `FE/pages/_app.tsx` (or the existing `layout/Layout.tsx`), new `FE/components/ErrorBoundary.tsx`.

- [ ] **Step 1: an error boundary** so a null field costs one section, not the whole page. Wrap the page content; render the site chrome plus a short "This section could not load" with a retry, never a blank screen.

```tsx
class ErrorBoundary extends React.Component<{children: React.ReactNode},
                                            {failed: boolean}> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    // A crash used to unmount the whole app and show Next's bare
    // "Application error" screen, which told us nothing and told the owner
    // the site was down. Keep the page standing and leave a trace.
    try {
      void fetch(`${getApiBase()}/event/clientError/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: error.message,
                               stack: (error.stack || '').slice(0, 2000),
                               path: window.location.pathname }),
      });
    } catch { /* reporting must never itself break the page */ }
  }
  render() { return this.state.failed ? <FallbackPanel /> : this.props.children; }
}
```

- [ ] **Step 2: the endpoint.** `POST event/clientError/` in `API/API/event/views.py`, writing to the existing errors table the admin dashboard already reads (`readErrors`, `admin/errors/`), so crashes appear where operational problems already appear. It must be unauthenticated (a crashing page has no session), rate-limited by IP, and must truncate the payload. Tests: a valid post records one row; an oversized payload is truncated, not rejected with a 500; a burst from one IP records at most N.
- [ ] **Step 3: a synthetic check that actually hydrates.** `curl` cannot see this class of bug — the HTML is fine. Add a small headless check that loads `/` and one city page, fails if the rendered text contains "Application error", and mails/logs on failure. Run it hourly from the dev machine or as a server cron with the node already on the box. Verify it CATCHES a crash by pointing it at a deliberately broken local build before trusting it.
- [ ] **Step 4:** deploy FE + API together, then confirm a real client error reaches `admin/errors/` by triggering one on a throwaway local page.

## Execution record
- 2026-09-01: written after shipping the outage fix, the preflight repair, the venue anchor (queue-only) and the 988-row merge. Tasks ordered by owner-visible impact; Task 1 is the one he will notice.
