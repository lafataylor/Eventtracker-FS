# Notion feedback round — Implementation Plan (2026-08-31)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the owner's Notion review of all three tickets: make the duplicates section trustworthy and bulk-operable, stop non-events reaching his queue, catch cross-post duplicates by title, extend search to handles and spelling variants, and answer every question with evidence.

**Architecture:** The heavy machinery already exists (clustered exact pass, fuzzy scorer, resolve/restore endpoints, delete endpoint that blacklists). This round is queue-hygiene rules, review-UI additions, one measured data pass (`--fuzzy` + high-confidence auto-merge), and search field/normalisation work. Every behaviour change replays RENATE locally and dry-runs on prod first.

**Tech Stack:** Django/DRF, Next.js pages-router admin, rapidfuzz, existing deploy scripts.

## Global Constraints

- Window 03:00–20:30 UTC; preflight first; never stop the instance; sync `server-api` from `HEAD:API/API`; dry-run before deploy; `/code-review` before commits; full unfiltered suites.
- The repo is public: no exploit detail in commits/PRs.
- Auto-hiding is allowed only where the earlier measurement said it is safe (score ≥95 AND exact same day); everything ambiguous stays reviewable. Deletes only via the existing endpoint (blacklists links), only on explicit UI actions.
- This is post-completion scope beyond the 28h agreement: the owner's Notion notes are the request, but hours/billing framing is the user's call — flag it, don't assume.

---

## Deep analysis (all numbers measured on prod, 2026-08-31)

**Night 1 of structured extraction PASSED decisively** — titled 23%→90%, dated 18%→84%, is_event 23%→95%, 31 content-keyed rows, 0 tracebacks, ~$0.35. The Molchat Doma post became 14 correctly-dated tour stops and a Mexico City wellness post became 8 distinct classes. Ticket 2's "show me it working" now has live proof.

**His five complaints map to five measurable causes:**
1. *"0% match" confusion* — every exact-pass pair stores score 0.0 and the UI prints it. Display bug.
2. *"Most pairs are not actually events"* — 85 of 165 pending pairs have BOTH sides `is_event != True`; last night added ~30 more (blank structured non-event rows that carry a venue, so the has-text rule queues them). Rule gap.
3. *"All the Hood Raves should be duplicates"* — cross-post duplicates are the fuzzy pass, which has never run on prod. Measured: the Summer Jam '26 cluster alone is ~10 visible rows scoring 80–100 same-day; the Dance Mania Aug-29 cluster scores 68–87. Auto-merge at ≥95+same-day was already measured safe (1,290 pairs); 82–95 must queue, not merge.
4. *"Previously Flagged is hard to verify"* — the tab shows the hidden row with no link to what it was hidden behind, and mixes "hidden as duplicate" with old auto-flag reasons.
5. *74780 "still listed, should be multi-day"* — a legacy, undated "This week at Club Tee Gee" roundup row the old extractor never expanded. Undated rows are shown by search/share deliberately (they were being data-lossed before). The forward fix is already live (the flag); the row itself should be re-ingested properly and the husk hidden.

**A new editorial issue surfaced by night 1, to ASK him, not fix silently:** events inherit the ACCOUNT's city, so the Molchat Doma US tour put Ventura/Seattle/Austin/etc. in the LA feed. Options: leave as is; hide events whose extracted city clearly isn't the account's city; add per-event city routing. His product call.

**Sequencing logic:** queue hygiene first (Tasks 1–2) so the section he's judging stops showing junk; then bulk-action UI (Task 3) so review is fast; then the fuzzy/auto-merge pass (Task 4) which will REFILL the queue with real cross-post pairs — running it before hygiene+UI would bury him again; search (Task 5) is independent; replies (Task 6) go out with evidence as each lands.

---

### Task 1: Non-events never reach the review queue (~1h)

Two rows that are both `is_event != True` are invisible everywhere (feed filters
`is_duplicate`; search excludes `is_event=False`); queueing them wastes owner
time. Collapse them like textless pairs.

**Files:** `API/API/event/management/commands/detect_duplicates.py`,
`API/API/event/test_detect_duplicates.py`.

- [ ] Failing tests: both-non-event pair with venues → collapsed, 0 pending;
  non-event vs real event → unchanged behaviour; one-off covers existing 85.
- [ ] Rule: in the queue branch, treat a pair as collapsible when
  `not (a.is_event or b.is_event)` even if both have text (comment the
  reasoning: not-a-listing on both sides = nothing to rescue).
- [ ] One-off (dry-run → apply) over existing pending pairs with both sides
  non-events (~85 → expect queue ≈ 80).
- [ ] Full suite, review, deploy, attended `run_dedupe.sh`, invariants.

### Task 2: Honest pair labels (~1h, FE + tiny API)

- [ ] Exact-pass pairs: stop storing score 0.0 — store the computed title
  similarity when queueing (informative sort), and the FE shows
  "Same Instagram post" WITHOUT a percentage for `match_type=exact_link`;
  fuzzy pairs keep "NN% match".
- [ ] Flagged tab context: serializer adds `canonical_summary` (id, name,
  date) + `hidden_reason` ("re-scrape of X" / "not an event" / "owner
  choice"); card shows "Hidden behind: <name> →" linking to the keeper.
  (Directly answers his "I'd have to search each event, right?")

### Task 3: Bulk actions (~3–4h, FE + API)

- [ ] `resolve_event_match` gains action `delete_both` (deletes via the
  existing blacklisting delete, marks match resolved).
- [ ] Pairs tab: checkbox per pair + select-all + "Delete selected" /
  "Not duplicates (selected)"; batches loop the existing endpoints.
- [ ] Flagged tab: same multi-select with "Delete permanently (selected)".
- [ ] Cluster row (his "more than one pair in one row"): group pending pairs
  client-side by shortcode; when a group has ≥3 rows render ONE card with all
  candidates, "keep this one" radio + "delete the rest" — server-side loops
  existing resolve calls. (The exact pass already clusters; only display.)
- [ ] E2E as the owner: select-all → delete on a junk page; cluster card on a
  real multi-pair post.

### Task 4: Cross-post duplicates — fuzzy queue + high-confidence auto-merge (~3h)

Preconditions from the earlier measurement stand: auto-merge ONLY score ≥95
AND identical date; 82–95 queues; recovery tab must show auto-merged rows
(now satisfied by Task 2's canonical link if we ALSO include canonical-set
rows behind a filter toggle — small addition).

- [ ] Recovery-tab toggle "show auto-hidden re-scrapes/merges" (lifts the
  `canonical__isnull=True` scope on demand).
- [ ] `detect_duplicates --fuzzy --auto-merge-threshold 95` option:
  ≥95+same-day → suppress loser (completeness keeper), else queue.
  Tests: the Hood Rave Summer Jam shape (10 rows, 80–100) → merges the ≥95
  same-day subset, queues the rest; the two-restaurant same-day case stays
  queued; LADW3 different-day stays untouched.
- [ ] Dry-run on prod, record counts; run attended; verify invariants and the
  Hood Rave/Dance Mania cards he screenshotted.
- [ ] Add `--fuzzy --auto-merge-threshold 95` to the nightly cron line.

### Task 5: Search — handles and variants (~1.5–2h + stretch)

- [ ] Server `search_events`: add `poster__user__icontains` (his "search the
  Instagram handle" ask) + squashed matching: also compare the query and
  candidate name/genre/artist with spaces+punctuation stripped, so
  hip-hop = hiphop = hip hop. (SQLite can't index that: apply as a Python
  filter over the bounded candidate set, same pattern as `_price_within`.)
- [ ] FE `eventMatchesTerm`: same squash + poster field, so local and server
  agree.
- [ ] Tests: hiphop/hip-hop/hip hop equal; handle search finds account's
  events; "hip hopp" documented as NOT matched (typo-fuzzy is the stretch:
  rapidfuzz partial ratio over the candidate set, separate task, ~2h — ask
  before building).

### Task 6: Answers to his questions, with evidence (as tasks land)

- [ ] Carousel proof (thread 2): the Molchat Doma post → 14 dated tour stops,
  the CDMX wellness post → 8 classes (screenshots); offer to re-paste his old
  test link too.
- [ ] 74780: re-paste `DcKUky6JpOK` via manual add (proper per-event entries),
  then hide/delete the undated husk; reply explaining old vs new extractor.
- [ ] "0% match" answer: it means "same post, system unsure" — being replaced
  by honest labels (Task 2).
- [ ] ASK, not fix: the tour-stops-in-LA-feed question (Molchat Doma example);
  and whether "select all delete" should also blacklist (recommend yes —
  existing delete endpoint already does).
- [ ] Flag-on note: night-1 numbers (90% titled vs 23%), cost ~$0.35/night.

### Task 7: Watch nights 2–3 of the flag (unchanged from the close-out plan)

- [ ] Same checks; plus confirm Task 1 stopped the queue growth.

---

## Estimates & order

| order | task | est |
|---|---|---|
| 1 | Non-events out of the queue + one-off | 1h |
| 2 | Honest labels + flagged-tab context | 1h |
| 3 | Bulk actions + cluster card | 3–4h |
| 4 | Fuzzy + auto-merge ≥95 + cron | 3h |
| 5 | Search handles + variants | 1.5–2h |
| 6 | Evidence replies | woven in |
| — | total | ~10–11h |

Stretch (ask first): typo-fuzzy search (~2h); per-event city routing (needs a
product decision).

## Execution record

- 2026-08-31: analysis done; night 1 judged PASS (titled 90%, dated 84%,
  is_event 95%, 0 tracebacks, ~$0.35). Plan written; awaiting go.

## Execution record (Task 4)
- 2026-08-31 (night): `--auto-merge-threshold` implemented + committed
  (473af04; cherry-picked a17e5cb onto PR #4; server-api tree re-synced).
  Independent pre-commit review found 3 real issues (keeper-later-loses
  canonical chains, keeper-side stale-flag cleanup missing, dry-run count
  divergence) — all fixed and pinned by tests; 143 green. Local dry-run:
  0 merge / 0 queue because all 3,149 local fuzzy candidates were parked
  rejected during E2E — prod counts are the real gate. GATE STANDS: prod
  dry-run at the 03:00 UTC window (scrape idle), record counts, and DO NOT
  auto-merge or touch cron until the counts have been shown. Recovery-tab
  visibility for auto-merges already exists (scope=merged, confirmed +
  reviewed_at NULL = machine-merged).
- 2026-09-01 ~06:45 UTC (Task 6): 74780's post re-run through the new
  manual add on prod: post_type=roundup, 7 dated events created
  (78750-78756, Aug 17-23, Los Angeles) — all past, so they age out
  correctly. Hiding the undated husk was BLOCKED by the session's
  permission classifier (prod writes denied in autonomous mode) — left
  for Zain; harmless meanwhile. Notion reply drafts for all 10 threads +
  2 asks written to docs/notion-replies-2026-09-01.md. Night-2 flag:
  490 rows, 90/94/100 — holds.
