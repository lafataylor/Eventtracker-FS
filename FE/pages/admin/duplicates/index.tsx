import React, { useEffect, useState } from 'react';
import AdminSideBar from '../../../components/Admin/AdminSideBar';
import { useStore } from '../../../store/store';
import LoadingDialog from '../../../components/overlay/LoadingDialog';
import ActionDialog from '../../../components/overlay/ActionDialog';
import EventCard from '../../../components/Dashboard/EventCard';
import Spinner from '../../../components/Spinner';
import InfoOverlay from '../../../components/Admin/InfoOverlay';
import EventDetails from '../../../components/Dashboard/EventDetails';
import {
  requestMiddleware,
  readEventMatches,
  resolveEventMatch,
  readAdminDuplicates,
  recoverDuplicate,
  deleteEvents,
} from '../../../services/lib/admin';
import { HIDE_INFO_OVERLAY, SHOW_INFO_OVERLAY } from '../../../store/actions/type';
import { Event } from '../../../interface/objects/simpleObject';

interface Match {
  match_id: number;
  score: number;
  match_type: string;
  event_a: Event;
  event_b: Event;
}

type ViewMode = 'pairs' | 'flagged';

// A hidden row carries why it is hidden and, for a collapse, the row it was
// kept instead of — so a restore decision needs no search on the main page.
type FlaggedEvent = Event & {
  hidden_reason?: 'duplicate' | 'flagged_by_scraper' | 'classified_non_event';
  kept_instead?: { id: number; name: string | null; start_date: string | null;
                   orig_link: string | null } | null;
};

const MATCH_LABEL: Record<string, string> = {
  fuzzy: 'Similar event',
  exact_link: 'Same Instagram post',
  phash: 'Similar flyer',
};

const Index = () => {
  const [state, dispatch] = useStore();
  const { loader, actionDialog, auth } = state;
  const { overlay } = auth;

  const [view, setView] = useState<ViewMode>('pairs');
  const [matches, setMatches] = useState<Match[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  // "Previously flagged": single events the OLD scraper hid via is_duplicate
  // before that auto-flagging was retired. Kept as a recovery path so an event
  // wrongly hidden by the old logic can be restored, and — behind the
  // 'merged' scope — so can rows collapsed by the duplicate pass, each shown
  // with what was kept instead (see the scope switch below).
  const [flagged, setFlagged] = useState<FlaggedEvent[]>([]);
  const [flaggedTotal, setFlaggedTotal] = useState(0);
  const [flaggedScope, setFlaggedScope] = useState<'flagged' | 'merged' | 'non_event'>('flagged');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A set, not a scalar: resolving two cards at once must keep both disabled
  // independently (a scalar re-enabled the first card mid-flight).
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const notify = (message: unknown, isError = false) =>
    dispatch({
      type: SHOW_INFO_OVERLAY,
      // InfoOverlay renders the message as a React child; an Error object here
      // throws "Objects are not valid as a React child" and white-screens the
      // page. Coerce anything non-string (axios rejections are strings, but
      // requestMiddleware and runtime errors are Error objects).
      payload: {
        message:
          typeof message === 'string'
            ? message
            : (message as any)?.message || 'Something went wrong.',
        isError,
      },
    });

  const fetchFlagged = async (loadMoreOffset: number = 0,
                              scope: 'flagged' | 'merged' | 'non_event' = flaggedScope) => {
    if (!(await requestMiddleware(dispatch))) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await readAdminDuplicates(loadMoreOffset, scope);
      if (res.status === 200) {
        const page = res.data?.duplicate_events || [];
        setFlagged((prev) => (loadMoreOffset > 0 ? [...prev, ...page] : page));
        setFlaggedTotal(res.data?.total ?? page.length);
      } else {
        setLoadError(true);
      }
    } catch (error) {
      setLoadError(true);
      notify((error as string) || 'Error loading flagged events', true);
    } finally {
      setIsLoading(false);
    }
  };

  const restore = async (eventId: number) => {
    if (!(await requestMiddleware(dispatch))) return;
    setBusyIds((prev) => new Set(prev).add(eventId));
    try {
      await recoverDuplicate(String(eventId));
      setFlagged((prev) => prev.filter((e) => e.id !== eventId));
      setSelectedFlagged((prev) => {
        const next = new Set(prev); next.delete(eventId); return next;
      });
      notify('Event restored to the site.', false);
    } catch (error) {
      notify('Could not restore the event. Please try again.', true);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  // The old duplicates page let the owner permanently delete junk (spam or
  // broken rows that should never go live). Restore-only left those with no
  // exit: past-dated rows never appear on /admin/events either.
  const removeForever = async (eventId: number) => {
    if (!window.confirm('Delete this event permanently? This cannot be undone.')) {
      return;
    }
    if (!(await requestMiddleware(dispatch))) return;
    setBusyIds((prev) => new Set(prev).add(eventId));
    try {
      await deleteEvents({ events: [String(eventId)] });
      setFlagged((prev) => prev.filter((e) => e.id !== eventId));
      setSelectedFlagged((prev) => {
        const next = new Set(prev); next.delete(eventId); return next;
      });
      notify('Event deleted.', false);
    } catch (error) {
      notify('Could not delete the event. Please try again.', true);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const fetchMatches = async () => {
    if (!(await requestMiddleware(dispatch))) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await readEventMatches('pending', 50);
      if (res.status === 200) {
        setMatches(res.data?.matches || []);
        setPendingTotal(res.data?.pending_total || 0);
        // A new batch means new match_ids; a selection carried over from the
        // old batch would count (and confirm against) pairs not on screen.
        setSelectedPairs(new Set());
      } else {
        // Not thrown by the interceptor but not success either — surface it
        // rather than silently render an empty "all caught up" screen.
        setLoadError(true);
        notify('Could not load duplicates. Please refresh.', true);
      }
    } catch (error) {
      setLoadError(true);
      notify((error as string) || 'Error loading duplicates', true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Clear any in-flight busy state from the other view so a stale id can't
    // disable a button here (the two views key busy state on different ids).
    setBusyIds(new Set());
    if (view === 'pairs') fetchMatches();
    else fetchFlagged();
  }, [view]);

  // Refetch the next page when the current batch of 50 empties but more remain
  // server-side. Done as an effect on committed state (not inside resolve)
  // so concurrent resolutions can't read a stale snapshot and show a false
  // "all caught up".
  useEffect(() => {
    if (view === 'pairs' && !isLoading && !loadError
        && matches.length === 0 && pendingTotal > 0) {
      fetchMatches();
    }
  }, [view, matches.length, pendingTotal, isLoading, loadError]);

  const resolve = async (match: Match,
                         action: 'keep_a' | 'keep_b' | 'not_duplicate' | 'delete_both') => {
    if (!(await requestMiddleware(dispatch))) return;
    setBusyIds((prev) => new Set(prev).add(match.match_id));
    try {
      await resolveEventMatch(match.match_id, action);
      // Events that this verdict removed from circulation: the suppressed
      // loser for keep_*, BOTH events for delete_both, none for not_duplicate.
      const goneIds =
        action === 'keep_a' ? [match.event_b.id]
        : action === 'keep_b' ? [match.event_a.id]
        : action === 'delete_both' ? [match.event_a.id, match.event_b.id]
        : [];
      // Drop the resolved pair AND any other pending pair that references a
      // now-gone event — otherwise a sibling pair would still offer to
      // "keep" it and silently un-hide (or crash on) it.
      //
      // Kept pure: React may invoke state updaters more than once (StrictMode
      // does), so no side effects are allowed inside them — an earlier version
      // decremented pendingTotal inside the updater and double-counted.
      const keepPair = (m: Match) =>
        m.match_id !== match.match_id &&
        !goneIds.includes(m.event_a.id) &&
        !goneIds.includes(m.event_b.id);
      // One filter pass; both state updates derive from it. Updaters stay
      // pure (StrictMode re-invokes them), and pendingTotal is an optimistic
      // display value that self-heals on the next fetch; the empty-batch
      // refetch is handled by the effect above, on committed state.
      const next = matches.filter(keepPair);
      setMatches(next);
      // Drop the same pairs from the selection, or the "N selected" badge
      // (and a later bulk action's confirm count) would count pairs that no
      // longer exist.
      setSelectedPairs((prev) => {
        const kept = new Set(prev);
        matches.forEach((m) => { if (!keepPair(m)) kept.delete(m.match_id); });
        return kept;
      });
      setPendingTotal((n) => Math.max(0, n - (matches.length - next.length)));
      notify(
        action === 'not_duplicate'
          ? 'Marked as not duplicates — both kept.'
          : action === 'delete_both'
          ? 'Both deleted; their posts are blacklisted.'
          : 'Duplicate hidden. You can restore it later.',
        false
      );
    } catch (error) {
      notify('Could not save your choice. Please try again.', true);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(match.match_id);
        return next;
      });
    }
  };

  // --- bulk selection (owner: "select multiple / select all and delete") ---
  const [selectedPairs, setSelectedPairs] = useState<Set<number>>(new Set());
  const [selectedFlagged, setSelectedFlagged] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const togglePair = (id: number) =>
    setSelectedPairs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleFlagged = (id: number) =>
    setSelectedFlagged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Bulk = a sequential loop over the existing per-item endpoint, then one
  // refetch. Sequential on purpose: SQLite serialises writes anyway, and a
  // parallel burst just turns into lock contention server-side.
  const bulkResolvePairs = async (action: 'not_duplicate' | 'delete_both') => {
    // Selection can only ever hold visible (non-clustered) pairs, but filter
    // through visiblePairs anyway so a cluster pair can never slip into a
    // bulk delete — cluster candidates are resolved only via their own card.
    const ids = visiblePairs.filter((m) => selectedPairs.has(m.match_id));
    if (ids.length === 0) return;
    if (action === 'delete_both' &&
        !window.confirm(`Delete BOTH events of ${ids.length} selected pair${ids.length === 1 ? '' : 's'}? ` +
                        'Their Instagram posts will be blacklisted so the nightly scan cannot re-add them. ' +
                        'This cannot be undone.')) return;
    if (!(await requestMiddleware(dispatch))) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    // Two selected pairs can share an event — deleting pair (A,B) cascades
    // away pair (B,C) server-side (EventMatch FKs are CASCADE), so resolving
    // (B,C) afterwards would 404. The owner confirmed deleting BOTH events of
    // EVERY selected pair, so for a cascaded pair the not-yet-deleted event
    // is deleted directly instead of being silently spared; a 404 from a
    // pair someone else resolved counts as done, not failed.
    const goneEventIds = new Set<number>();
    for (const m of ids) {
      const stale = [m.event_a, m.event_b].filter((e) => goneEventIds.has(e.id));
      try {
        if (action === 'delete_both' && stale.length > 0) {
          const remaining = [m.event_a, m.event_b].filter((e) => !goneEventIds.has(e.id));
          if (remaining.length > 0) {
            await deleteEvents({ events: remaining.map((e) => String(e.id)) });
          }
          remaining.forEach((e) => goneEventIds.add(e.id));
          ok++;
          continue;
        }
        await resolveEventMatch(m.match_id, action);
        ok++;
        if (action === 'delete_both') {
          goneEventIds.add(m.event_a.id);
          goneEventIds.add(m.event_b.id);
        }
      } catch (error) {
        if ((error as any)?.response?.status === 404) ok++;
        else failed++;
      }
    }
    setSelectedPairs(new Set());
    setBulkBusy(false);
    notify(failed === 0
      ? `${ok} pair${ok === 1 ? '' : 's'} ${action === 'delete_both' ? 'deleted' : 'marked not duplicates'}.`
      : `${ok} done, ${failed} failed — the rest are still in the list.`, failed > 0);
    fetchMatches();
  };

  const bulkFlagged = async (kind: 'restore' | 'delete') => {
    const ids = flagged.filter((e) => selectedFlagged.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    if (kind === 'delete' &&
        !window.confirm(`Delete ${ids.length} event${ids.length === 1 ? '' : 's'} permanently? This cannot be undone.`)) return;
    if (!(await requestMiddleware(dispatch))) return;
    setBulkBusy(true);
    let failed = 0;
    if (kind === 'delete') {
      // deleteEvents already takes a list (and blacklists each link).
      try { await deleteEvents({ events: ids.map(String) }); }
      catch { failed = ids.length; }
    } else {
      for (const id of ids) {
        try { await recoverDuplicate(String(id)); } catch { failed++; }
      }
    }
    setSelectedFlagged(new Set());
    setBulkBusy(false);
    notify(failed === 0
      ? `${ids.length} event${ids.length === 1 ? '' : 's'} ${kind === 'delete' ? 'deleted' : 'restored'}.`
      : `${ids.length - failed} done, ${failed} failed.`, failed > 0);
    fetchFlagged(0);
  };

  // --- cluster view (owner: "a duplicate that is more than just one pair —
  // show that all in one row / section") ---
  // Pending same-post pairs that share a shortcode are one story: N candidate
  // rows for one Instagram post. Grouping is display-only; the actions below
  // DELETE the rejected candidates (via the blacklisting delete) rather than
  // chaining keep_a/keep_b client-side, which would recreate the
  // hidden-behind-a-hidden-row chains the backend works to prevent.
  const clusters: { key: string; events: Event[]; pairs: Match[] }[] = [];
  const clusteredPairIds = new Set<number>();
  {
    const byPost = new Map<string, Match[]>();
    for (const m of matches) {
      const sc = (m.event_a as any).shortcode;
      if (m.match_type === 'exact_link' && sc && sc === (m.event_b as any).shortcode) {
        byPost.set(sc, [...(byPost.get(sc) || []), m]);
      }
    }
    byPost.forEach((pairs, key) => {
      if (pairs.length < 2) return;
      const events = new Map<number, Event>();
      pairs.forEach((m) => { events.set(m.event_a.id, m.event_a); events.set(m.event_b.id, m.event_b); });
      clusters.push({ key, events: Array.from(events.values()), pairs });
      pairs.forEach((m) => clusteredPairIds.add(m.match_id));
    });
  }

  // The pair list, checkboxes, and select-all all work on this, NOT on raw
  // `matches`: cluster pairs render only inside their cluster card (which has
  // no checkbox), so selecting them via "Select all" would let a bulk
  // "Delete both of each" silently delete every candidate of a cluster —
  // including the keeper the card tells the owner to pick.
  const visiblePairs = matches.filter((m) => !clusteredPairIds.has(m.match_id));

  const clusterKeep = async (cluster: { events: Event[]; pairs: Match[] }, keeper: Event) => {
    const losers = cluster.events.filter((e) => e.id !== keeper.id);
    if (!window.confirm(`Keep "${keeper.name || 'this one'}" and delete the other ` +
                        `${losers.length} candidate${losers.length === 1 ? '' : 's'} of this post? ` +
                        'Deleted ones cannot be restored.')) return;
    if (!(await requestMiddleware(dispatch))) return;
    setBulkBusy(true);
    try {
      // The server spares the shared post link from blacklisting while the
      // keeper survives (survivor check in AdminEvent.delete), so the
      // nightly scrape can still refresh the kept event.
      await deleteEvents({ events: losers.map((e) => String(e.id)) });
      // The keeper may carry a stale is_duplicate/suppressed flag from the
      // old scraper or an earlier sibling verdict; with its pairs gone there
      // would be no way left to clear it. Un-hide it explicitly.
      try {
        await recoverDuplicate(String(keeper.id));
      } catch {
        // Losers are gone either way; worst case the keeper shows up under
        // "Previously flagged" where Restore still works.
      }
      notify(`Kept "${keeper.name || 'untitled'}", deleted ${losers.length}.`, false);
    } catch {
      notify('Could not delete the other candidates. Please try again.', true);
    }
    setBulkBusy(false);
    fetchMatches();
  };

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="duplicates" />
      <div className="px-8 pt-8 h-full flex flex-col w-full text-off-white overflow-x-auto">
        <nav className="border-b-4 border-beaming-orange flex justify-start items-center pb-3 gap-4">
          <div className="text-5xl font-bold px-3">Duplicates</div>
          {!isLoading && view === 'pairs' && (
            <div className="text-lg text-stone-gray self-end pb-1">
              {pendingTotal} pair{pendingTotal === 1 ? '' : 's'} to review
            </div>
          )}
        </nav>

        <div className="flex gap-2 mt-4 px-3">
          {(['pairs', 'flagged'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`py-2 px-4 rounded-lg font-medium ${
                view === v
                  ? 'bg-beaming-orange text-black'
                  : 'border border-stone-gray text-off-white'
              }`}
            >
              {v === 'pairs' ? 'Duplicate pairs' : 'Previously flagged'}
            </button>
          ))}
        </div>

        <p className="mt-4 px-3 text-stone-gray max-w-3xl">
          {view === 'pairs'
            ? 'These look like the same event posted twice. Compare them, then keep the better one — the other is hidden from the site (and can be restored).'
            : 'Events currently hidden as duplicates by the automatic scraper. If any is a real event that should be live, restore it.'}
        </p>

        <div className="flex-1 w-full overflow-y-auto py-8">
          {isLoading ? (
            <div className="w-full h-64 flex items-center justify-center">
              <Spinner colorClass="text-beaming-orange" size={48} />
            </div>
          ) : loadError ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-3">
              <div className="text-xl">Couldn’t load duplicates.</div>
              <button
                className="py-2 px-6 rounded-lg bg-beaming-orange text-black font-semibold"
                onClick={() => (view === 'pairs' ? fetchMatches() : fetchFlagged())}
              >
                Try again
              </button>
            </div>
          ) : view === 'flagged' ? (
            <>
            {/* Two different kinds of hidden row, kept apart on purpose: the
                scraper's old flags are the restorable ones, and would be
                buried under ~25k duplicate collapses if merged into one list. */}
            <div className="flex gap-2 mb-4">
              {([['flagged', 'Flagged (old scraper)'],
                 ['merged', 'Hidden as duplicates'],
                 ['non_event', 'Hidden as not an event']] as const).map(([s, label]) => (
                <button
                  key={s}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    flaggedScope === s
                      ? 'bg-beaming-orange text-black font-semibold'
                      : 'border border-stone-gray text-off-white'}`}
                  onClick={() => {
                    setFlaggedScope(s);
                    setFlagged([]);
                    setFlaggedTotal(0);
                    setSelectedFlagged(new Set());
                    fetchFlagged(0, s);
                  }}
                >
                  {label}
                </button>
              ))}
              {flagged.length > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={selectedFlagged.size > 0 && selectedFlagged.size === flagged.length}
                    onChange={(e) =>
                      setSelectedFlagged(e.target.checked
                        ? new Set(flagged.map((ev) => ev.id))
                        : new Set())}
                  />
                  Select all loaded
                </label>
              )}
              {selectedFlagged.size > 0 && (
                <>
                  <span className="text-stone-gray text-sm">{selectedFlagged.size} selected</span>
                  <button
                    className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 text-sm"
                    onClick={() => bulkFlagged('restore')}
                    disabled={bulkBusy}
                  >
                    Restore selected
                  </button>
                  <button
                    className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50 text-sm"
                    onClick={() => bulkFlagged('delete')}
                    disabled={bulkBusy}
                  >
                    Delete selected
                  </button>
                  {bulkBusy && <Spinner colorClass="text-beaming-orange" size={18} />}
                </>
              )}
            </div>
            {flagged.length === 0 ? (
              <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
                <div className="text-2xl font-bold">Nothing here 🎉</div>
                <div className="text-stone-gray">
                  {flaggedScope === 'merged'
                    ? 'No duplicates have been hidden yet.'
                    : flaggedScope === 'non_event'
                    ? 'Nothing has been classified as not-an-event.'
                    : 'No previously-flagged events to review.'}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6">
                {flagged.map((event) => (
                  <div
                    key={`flagged-${event.id}`}
                    className="p-4 bg-stone-gray bg-opacity-20 rounded-2xl flex flex-col items-center gap-3"
                  >
                    <label className="w-64 flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFlagged.has(event.id)}
                        onChange={() => toggleFlagged(event.id)}
                      />
                      Select
                    </label>
                    <div className="w-64">
                      <EventCard event={event} disabled={false} isFavorite={false} />
                    </div>
                    {/* Why it is hidden, and what survived in its place, so a
                        restore decision needs no search on the main page. */}
                    <div className="w-64 text-xs text-stone-gray">
                      {event.kept_instead ? (
                        <>
                          Hidden as a duplicate. Kept instead:{' '}
                          <span className="text-off-white">
                            {event.kept_instead.name || 'untitled event'}
                          </span>
                          {event.kept_instead.start_date
                            ? ` (${new Date(event.kept_instead.start_date).toLocaleDateString()})`
                            : ''}
                        </>
                      ) : event.hidden_reason === 'classified_non_event' ? (
                        'The extractor decided this is not an event, so it is kept off the site. Restore if it got that wrong.'
                      ) : (
                        'Flagged by the scraper as not an event.'
                      )}
                    </div>
                    <button
                      className="py-2 px-4 w-64 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                      onClick={() => restore(event.id)}
                      disabled={busyIds.has(event.id) || bulkBusy}
                    >
                      Restore to site
                    </button>
                    <button
                      className="py-2 px-4 w-64 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                      onClick={() => removeForever(event.id)}
                      disabled={busyIds.has(event.id) || bulkBusy}
                    >
                      Delete permanently
                    </button>
                  </div>
                ))}
                {flagged.length < flaggedTotal && (
                  <div className="w-full flex justify-center py-4">
                    <button
                      className="py-2 px-6 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange"
                      onClick={() => fetchFlagged(flagged.length)}
                    >
                      Load more ({flagged.length} of {flaggedTotal})
                    </button>
                  </div>
                )}
              </div>
            )}
            </>
          ) : matches.length === 0 ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
              <div className="text-2xl font-bold">All caught up 🎉</div>
              <div className="text-stone-gray">No duplicates left to review.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 max-w-5xl">
              {/* Bulk toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPairs.size > 0 && selectedPairs.size === visiblePairs.length}
                    onChange={(e) =>
                      setSelectedPairs(e.target.checked
                        ? new Set(visiblePairs.map((m) => m.match_id))
                        : new Set())}
                  />
                  Select all on page
                </label>
                {selectedPairs.size > 0 && (
                  <>
                    <span className="text-stone-gray text-sm">{selectedPairs.size} selected</span>
                    <button
                      className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 text-sm"
                      onClick={() => bulkResolvePairs('not_duplicate')}
                      disabled={bulkBusy}
                    >
                      Not duplicates
                    </button>
                    <button
                      className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50 text-sm"
                      onClick={() => bulkResolvePairs('delete_both')}
                      disabled={bulkBusy}
                    >
                      Delete both of each
                    </button>
                    {bulkBusy && <Spinner colorClass="text-beaming-orange" size={18} />}
                  </>
                )}
              </div>

              {/* Whole-post clusters: several candidates of ONE Instagram
                  post shown in one section instead of pair-by-pair. */}
              {clusters.map((c) => (
                <div key={`cluster-${c.key}`} className="p-6 bg-stone-gray bg-opacity-20 rounded-2xl border border-beaming-orange border-opacity-40">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-beaming-orange font-bold uppercase text-sm tracking-wide">
                      Same Instagram post
                    </span>
                    <span className="text-stone-gray text-sm">
                      {c.events.length} candidates — keep one, the rest are deleted
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {c.events.map((ev) => (
                      <div key={ev.id} className="flex flex-col items-center gap-3">
                        <div className="w-56">
                          <EventCard event={ev} disabled={false} isFavorite={false} />
                        </div>
                        <button
                          className="py-2 px-4 w-56 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                          onClick={() => clusterKeep(c, ev)}
                          disabled={bulkBusy}
                        >
                          Keep this one
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {visiblePairs.map((m) => {
                const busy = busyIds.has(m.match_id) || bulkBusy;
                return (
                  <div
                    key={m.match_id}
                    className="p-6 bg-stone-gray bg-opacity-20 rounded-2xl"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        checked={selectedPairs.has(m.match_id)}
                        onChange={() => togglePair(m.match_id)}
                      />
                      <span className="text-beaming-orange font-bold uppercase text-sm tracking-wide">
                        {MATCH_LABEL[m.match_type] || 'Possible duplicate'}
                      </span>
                      {/* A same-post pair is not scored by similarity: the
                          two rows come from ONE Instagram post, which is the
                          evidence. Printing "0% match" for those read as "the
                          system is 0% sure" (owner feedback 2026-08-30). Only
                          cross-post (fuzzy) pairs carry a meaningful score. */}
                      <span className="text-stone-gray text-sm">
                        {m.match_type === 'exact_link'
                          ? 'system unsure which to keep'
                          : `${Math.round(m.score)}% match`}
                      </span>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch gap-4">
                      {/* Event A */}
                      <div className="flex-1 flex flex-col items-center gap-3">
                        <div className="w-64">
                          <EventCard event={m.event_a} disabled={false} isFavorite={false} />
                        </div>
                        <button
                          className="py-2 px-4 w-64 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                          onClick={() => resolve(m, 'keep_a')}
                          disabled={busy}
                        >
                          Keep this one
                        </button>
                      </div>

                      {/* Middle divider / whole-pair verdicts */}
                      <div className="flex md:flex-col items-center justify-center gap-3 px-2">
                        <span className="text-stone-gray font-bold">vs</span>
                        <button
                          className="py-2 px-4 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 whitespace-nowrap"
                          onClick={() => resolve(m, 'not_duplicate')}
                          disabled={busy}
                        >
                          Not duplicates
                        </button>
                        <button
                          className="py-2 px-4 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50 whitespace-nowrap"
                          onClick={() => {
                            if (window.confirm('Delete BOTH events of this pair? Their posts will be blacklisted. This cannot be undone.')) {
                              resolve(m, 'delete_both');
                            }
                          }}
                          disabled={busy}
                        >
                          Delete both
                        </button>
                      </div>

                      {/* Event B */}
                      <div className="flex-1 flex flex-col items-center gap-3">
                        <div className="w-64">
                          <EventCard event={m.event_b} disabled={false} isFavorite={false} />
                        </div>
                        <button
                          className="py-2 px-4 w-64 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                          onClick={() => resolve(m, 'keep_b')}
                          disabled={busy}
                        >
                          Keep this one
                        </button>
                      </div>
                    </div>

                    {busy && (
                      <div className="flex justify-center mt-3">
                        <Spinner colorClass="text-beaming-orange" size={20} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <EventDetails isEdit={true} />
      </div>

      {loader.isVisible && <LoadingDialog />}
      {actionDialog.dialog != null && <ActionDialog />}
      {overlay.isVisible && (
        <InfoOverlay
          message={overlay.message}
          onClose={() => dispatch({ type: HIDE_INFO_OVERLAY })}
        />
      )}
    </div>
  );
};

export default Index;
