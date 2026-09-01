# Bulk review actions + search extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner the review actions he asked for (delete both, select all, whole-cluster rows) and make search match Instagram handles and spelling variants — Tasks 3 and 5 of the Notion-feedback plan.

**Architecture:** One new action (`delete_both`) inside the existing atomic `resolve_event_match`; bulk = client-side loops over the existing per-item endpoints (≤50 visible items, no new batch API); cluster rows are a pure display grouping of pending pairs that share a shortcode. Search gains one Q clause (poster) plus a Python-side "squashed text" pass over the SQL candidate set, mirrored in the FE's local matcher.

**Tech Stack:** Django/DRF, Next.js pages-router, existing `deleteEvents` (blacklists links), rapidfuzz NOT needed here.

## Global Constraints

- Window 03:00–20:30 UTC; preflight; never stop the instance; sync `server-api` from `HEAD:API/API`; dry-run then deploy; `/code-review` before commits; full unfiltered suites and `npm run build`.
- Destructive UI actions are built and E2E-tested on the LOCAL stack only; nobody clicks bulk-delete on prod data except the owner.
- `is_*` booleans are nullable; compare with `is True` / `is False` when it matters.

---

### Task A: `delete_both` action (API)

**Files:**
- Modify: `API/API/event/views.py` (`resolve_event_match`)
- Modify: `API/API/event/test_detect_duplicates.py` (append a `ResolveDeleteBothTests` class)

**Interfaces:**
- Consumes: existing `EventMatch`, `BlacklistedLink` (same blacklist behaviour as `AdminEvent.delete`).
- Produces: `resolve_event_match` accepts `action="delete_both"`; both events hard-deleted, their `orig_link`s blacklisted, match row deleted with them (FK cascade or explicit delete — verify `EventMatch` FK `on_delete` first and state it in the code).

- [ ] **Step 1: failing tests** — `delete_both` removes both events, blacklists
both links, no pending pair remains; `keep_a`/`not_duplicate` unchanged;
unknown action still `InvalidParameters`.

```python
class ResolveDeleteBothTests(TestCase):
    def setUp(self):
        from c_auth.models import User
        import jwt
        u = User.objects.create(email='del@test.dev', usertype='admin')
        self.tok = jwt.encode({'id': u.id}, 'secret', algorithm='HS256')
        self.a = Event.objects.create(name='A', orig_link='https://ig/p/AA/', is_event=True)
        self.b = Event.objects.create(name='B', orig_link='https://ig/p/BB/', is_event=True)
        self.m = EventMatch.objects.create(event_a=self.a, event_b=self.b,
                                           score=0.0, match_type='exact_link',
                                           status='pending')

    def test_delete_both_removes_events_and_blacklists(self):
        from c_admin.models import BlacklistedLink
        r = self.client.post('/v1/event/matches/resolve/',
                             {'match_id': self.m.id, 'action': 'delete_both'},
                             content_type='application/json',
                             HTTP_AUTHORIZATION='Token ' + self.tok)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Event.objects.filter(id__in=[self.a.id, self.b.id]).exists())
        self.assertFalse(EventMatch.objects.filter(id=self.m.id).exists())
        self.assertEqual(BlacklistedLink.objects.filter(
            url__in=['https://ig/p/AA/', 'https://ig/p/BB/']).count(), 2)
```

- [ ] **Step 2: run red** (unknown action today → `InvalidParameters`).
- [ ] **Step 3: implement** — add `"delete_both"` to the allowed set; inside the
existing `transaction.atomic()`:

```python
            if action == "delete_both":
                # The owner judged BOTH candidates junk. Blacklist first so
                # the nightly scrape cannot re-ingest either post (same rule
                # as AdminEvent.delete), then hard-delete. The EventMatch row
                # must not outlive its events.
                for ev in (match.event_a, match.event_b):
                    if ev.orig_link and not BlacklistedLink.objects.filter(
                            url=ev.orig_link).exists():
                        BlacklistedLink.objects.create(
                            url=ev.orig_link,
                            reason="Deleted from duplicates review")
                match.delete()
                match.event_a.delete()
                match.event_b.delete()
                return Success({"deleted": True})
```

(Import `BlacklistedLink` from `c_admin.models` at the top with the existing
imports; check FK `on_delete` for EventMatch → if CASCADE, deleting events
first is enough — write whichever matches the model and say why.)

- [ ] **Step 4: full suite green; do not commit yet** (ships with Task B).

### Task B: bulk select + cluster rows (FE)

**Files:**
- Modify: `FE/pages/admin/duplicates/index.tsx`
- Modify: `FE/services/lib/admin.tsx` (`resolveEventMatch` already takes (id, action) — just widen the action type)

**Interfaces:**
- Consumes: `resolveEventMatch(match_id, 'keep_a'|'keep_b'|'not_duplicate'|'delete_both')`, `deleteEvents({events: ids})`, `removeDuplicateLabel`.
- Produces: per-pair "Delete both" button; checkbox per pair + "Select all on page" + bulk "Not duplicates" / "Delete both" for the selection; same multi-select on the flagged tab with bulk Restore / Delete permanently; pending pairs sharing a shortcode render as ONE cluster card (all candidates side by side, one "Keep this one" per candidate that resolves every pair in the cluster toward it, plus "Delete all").

- [ ] **Step 1:** state: `selected: Set<number>` per tab; a `window.confirm`
before any bulk delete stating the count and that posts get blacklisted.
- [ ] **Step 2:** cluster grouping — pure function over `matches`:
group by `event_a.shortcode` when `match_type === 'exact_link'` and the group
has ≥2 pairs; collect the distinct events of the group; "keep X" loops the
group's pairs calling `keep_a`/`keep_b` toward X (skip pairs not containing
X → `not_duplicate`); "Delete all" = `deleteEvents` with every candidate id
then `not_duplicate` each pair. Keep the existing single-pair card for
groups of one.
- [ ] **Step 3:** `tsc --noEmit` clean and full `npm run build`.
- [ ] **Step 4:** local E2E as a dumb user (agent-browser): select-all →
bulk not-duplicates on one page; delete-both on one pair; cluster card
renders for a 3-pair post and "keep" collapses the lot; flagged tab bulk
restore. Screenshot each.
- [ ] **Step 5:** `/code-review` the combined diff, fix findings, commit,
push, sync branches; deploy API+FE in the next window.

### Task C: search — handles and squashed variants

**Files:**
- Modify: `API/API/event/views.py` (`search_events`), `API/API/event/test_search.py`
- Modify: `FE/components/SearchBar.tsx` (`eventMatchesTerm`, `norm`)

**Interfaces:**
- Produces: server matches `poster__user__icontains` and squashed-text
comparison (non-alphanumerics stripped) on name/artist/genres/offering; FE
local matcher does the same, so local and server agree.

- [ ] **Step 1: failing tests** (`test_search.py`): "hiphop" finds an event
with `genres='hip-hop'` and vice versa; "hip hop" finds both; a poster
username query ("bar_oriente") returns that account's events; an unrelated
term still returns nothing.
- [ ] **Step 2: implement server** — add `| Q(poster__user__icontains=query)`
to the Q; then a Python pass in the same bounded way `_price_within` works:

```python
        # Spelling variants: "hip-hop" / "hiphop" / "hip hop" must match each
        # other (owner feedback 2026-08-30). SQL icontains cannot ignore
        # punctuation, so candidates are widened with a squashed comparison
        # over the already-bounded, visibility-filtered recent set.
        squashed_q = re.sub(r'[^a-z0-9]', '', normalize_text(query))
        if squashed_q and len(squashed_q) >= 3:
            def hits(e):
                hay = ' '.join(filter(None, (e.name, e.artist, e.genres,
                                             e.offering)))
                return squashed_q in re.sub(r'[^a-z0-9]', '',
                                            normalize_text(hay))
            extra_ids = [e.id for e in base_visible_window.only(
                'id', 'name', 'artist', 'genres', 'offering')[:SEARCH_SCAN_LIMIT]
                if hits(e)]
```
(Reuse the function's existing visibility+window queryset for
`base_visible_window`; define `SEARCH_SCAN_LIMIT = 5000` beside
`PRICE_SCAN_LIMIT` with the same rationale; union `extra_ids` into the
result before the limit.)
- [ ] **Step 3: FE** — in `eventMatchesTerm`, add the poster username field
and a squashed comparison via the existing `norm()` plus
`.replace(/[^a-z0-9]/g, '')`.
- [ ] **Step 4:** suites, build, `/code-review`, commit; deploy with Task B.
- [ ] **Step 5:** local E2E: type "hiphop", "hip-hop", "hip hop" → same
counts; search an IG handle → account's events. NOT covered (say so to the
owner): typo forms like "hip hopp" — that is the fuzzy-search stretch item.

### Deploy + verify (both tasks together, next window)

- [ ] preflight → deploy API → staged FE build → deploy FE → browser-verify
on prod as the owner (labels, scopes, one harmless bulk action:
select 2 junk pairs → "Not duplicates" → undo not needed since nothing hides)
→ record numbers in the execution record → comment on PR (same branch).

## Execution record
- 2026-08-31: plan written. Tasks 1–2 of the feedback round are on PR #4
  (reviewed; E2E-passed locally; deploy waits for the window).
- 2026-08-31 (later): five-angle review of PR #4 complete — no regressions of
  protected decisions; 2 findings (scope-blind docstrings; the non-event
  ±1-day collapse inherited rather than decided) fixed in cfff268 with a
  pinning test (126 total). Local dumb-user E2E PASS: exact pairs show
  "system unsure which to keep" with no fake %, fuzzy pairs keep their %,
  both scopes render, merged scope shows real "Kept instead: X (date)" lines.
  Review comment posted on PR #4. Task A (delete_both) started.
- 2026-08-31 (Task C): server search gains `poster__user__icontains` +
  bounded squash pass (SEARCH_SCAN_LIMIT=5000; per-field, never joined;
  ≥3-char guard; poster included so "bar oriente" finds bar_oriente).
  FE eventMatchesTerm mirrors both. 132 API tests OK; tsc rc=0; full
  build compiled. Live local API: hip-hop/hiphop/hip hop all → 39;
  bar_oriente and "bar oriente" both → 10 (was 3); japan_cdmx → 0 is
  correct (0 future-dated visible events, 847 total). Browser E2E on
  /mexico-city/: all three spellings → Showing 2; both handle forms →
  Showing 4. NOT covered: typo forms ("hip hopp") — fuzzy stretch item.
- 2026-08-31 (review round + commit): two independent pre-commit review
  passes over the A+B+C diff surfaced 8 real issues; all fixed:
  (1) select-all leaked cluster pairs into bulk delete -> visiblePairs
  everywhere; (2) cluster keep blacklisted the keeper's own post ->
  survivor-aware blacklisting in AdminEvent.delete AND delete_both;
  (3) keeper could stay hidden -> clusterKeep now calls recoverDuplicate;
  (4) chained-pair bulk silently spared the third event -> deletes it
  directly, 404s count as done; (5) row buttons live during bulk ->
  disabled via bulkBusy; (6) IN() overflow risk -> extra_ids capped at
  SEARCH_RESULT_LIMIT; (7) squash field parity server<->FE; (8) missing
  status assert + stale docstrings/comments. E2E re-verified with DB
  asserts: select-all=47/50, cluster keep un-hides stale keeper and
  spares the shared link, chained bulk deletes all 3 events + blacklists
  all 3 links. 134 tests OK; tsc rc=0; build rc=0. Committed 57756fc
  (feat/dedupe-and-carousel), cherry-picked e471bd0 (post-deploy-fixes,
  PR #4, comment posted), server-api/server-fe trees synced + verified.
  Deploy: window closed at 22:34 UTC; goes out next window (03:00 UTC).
- 2026-09-01 03:53-06:20 UTC (deploy window): preflight PASSED (idle 4h24m,
  7G free). API deployed (57756fc+473af04 content; migrations none;
  gunicorn active; events 60489, suppressed 25693, EventMatch 25821;
  rollback tar api-code-predeploy-20260901-055310). FE: staging dir was
  missing — recreated from server-fe (clone + .env.local copy + nvm node
  + npm install/build with $STAGE/build.log '=== done' sentinel), then
  deploy_fe.sh COMPLETE (pm2 online; site 200). Prod verified read-only:
  search hip-hop/hiphop/'hip hop' all 121, bar_oriente/'bar oriente' both
  17; admin duplicates shows 78 pairs, select-all toolbar, 'system unsure'
  labels, cluster card, Delete both. NOTHING destructive clicked on prod.
- 2026-09-01 (Task 4 gate, DECISION PENDING): prod dry-run
  `--fuzzy --auto-merge-threshold 95 --dry-run`: 18,150 dated events ->
  WOULD AUTO-MERGE 988 pairs (score>=95 + same day), WOULD QUEUE 1,288
  (82-95 band / +/-1 day), 3,415 candidates total. Per the gate nothing
  was hidden and cron is unchanged. Night-2 flag check: 490 rows, 90%
  titled / 94% dated / 100% classified — pass holds. Queue 90 pending.
  Awaiting Zain's call on (a) running the auto-merge, (b) whether to also
  queue the 1,288 review pairs at once or in slices.
