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
  readEventMatchGroups,
  resolveEventMatchGroup,
  readAdminDuplicates,
  recoverDuplicate,
  deleteEvents,
} from '../../../services/lib/admin';
import { HIDE_INFO_OVERLAY, SHOW_INFO_OVERLAY } from '../../../store/actions/type';
import { Event } from '../../../interface/objects/simpleObject';

type ViewMode = 'pairs' | 'flagged';

// A hidden row carries why it is hidden and, for a collapse, the row it was
// kept instead of — so a restore decision needs no search on the main page.
type FlaggedEvent = Event & {
  hidden_reason?: 'duplicate' | 'flagged_by_scraper' | 'classified_non_event';
  kept_instead?: { id: number; name: string | null; start_date: string | null;
                   orig_link: string | null } | null;
};

// The review page as GROUPS (owner 2026-09-18: "they should all be grouped
// together if they have any similarity especially image, or similar title,
// or similar date and location"). A group is every pending pair on one day
// connected through shared events, plus events on that day with the
// identical flyer. One decision per group instead of one per pair.
interface GroupPair {
  match_id: number;
  event_a_id: number;
  event_b_id: number;
  score: number;
  match_type: string;
}
interface Group {
  key: number;
  soonest: string | null;
  events: Event[];
  pairs: GroupPair[];
}
const PAGE_SIZE = 20;


const Index = () => {
  const [state, dispatch] = useStore();
  const { loader, actionDialog, auth } = state;
  const { overlay } = auth;

  const [view, setView] = useState<ViewMode>('pairs');
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
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

  // `quiet` reloads in place (after a verdict): no full-page spinner, and
  // `limit` covers everything already loaded, so resolving a group on the
  // fourth "Load more" does not throw the owner back to the first twenty.
  const fetchGroups = async (offset: number = 0, limit: number = PAGE_SIZE, quiet = false) => {
    if (!(await requestMiddleware(dispatch))) return;
    if (offset === 0 && !quiet) setIsLoading(true);
    setLoadError(false);
    try {
      const res = await readEventMatchGroups(limit, offset);
      if (res.status === 200) {
        const page: Group[] = res.data?.groups || [];
        setGroups((prev) => (offset === 0 ? page : [...prev, ...page]));
        setTotalGroups(res.data?.total_groups || 0);
        setPendingTotal(res.data?.pending_total || 0);
        if (offset === 0) setSelectedGroups(new Set());
      } else {
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
    setBusyIds(new Set());
    if (view === 'pairs') fetchGroups(0);
    else fetchFlagged();
  }, [view]);

  // One verdict for a whole group. The server hides, rejects or deletes
  // every member and carries the verdict to the other dates of the same
  // posts, so the group (and its later-week twins) leave the list together.
  const resolveGroup = async (g: Group, action: 'keep' | 'keep_all' | 'delete_all', keepId?: number) => {
    if (action === 'delete_all' &&
        !window.confirm(`Delete all ${g.events.length} events of this group? Their posts will be blacklisted. This cannot be undone.`)) return;
    if (!(await requestMiddleware(dispatch))) return;
    setBusyIds((prev) => new Set(prev).add(g.key));
    try {
      await resolveEventMatchGroup(g.pairs.map((p) => p.match_id), action, keepId);
      // Refetch rather than drop the group locally: a verdict also carries
      // to later weeks of the same posts, and a hidden member removes other
      // groups from the list, so only the server knows what is left.
      await fetchGroups(0, Math.min(100, Math.max(PAGE_SIZE, groups.length)), true);
      notify(
        action === 'keep_all' ? 'Kept all of them.'
        : action === 'delete_all' ? 'All deleted; their posts are blacklisted.'
        : 'Kept one, hid the rest. You can restore them later.',
        false
      );
    } catch (error) {
      notify('Could not save your choice. Please try again.', true);
    } finally {
      setBusyIds((prev) => { const next = new Set(prev); next.delete(g.key); return next; });
    }
  };

  // --- bulk selection (owner: "select multiple / select all and delete") ---
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [selectedFlagged, setSelectedFlagged] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleGroup = (key: number) =>
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const toggleFlagged = (id: number) =>
    setSelectedFlagged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Bulk = a sequential loop over the group endpoint, then one refetch.
  // Sequential on purpose: SQLite serialises writes anyway.
  const bulkGroups = async (action: 'keep_all' | 'delete_all') => {
    const picked = groups.filter((g) => selectedGroups.has(g.key));
    if (picked.length === 0) return;
    if (action === 'delete_all' &&
        !window.confirm(`Delete every event of ${picked.length} selected group${picked.length === 1 ? '' : 's'}? ` +
                        'Their Instagram posts will be blacklisted so the nightly scan cannot re-add them. ' +
                        'This cannot be undone.')) return;
    if (!(await requestMiddleware(dispatch))) return;
    setBulkBusy(true);
    let ok = 0, failed = 0;
    for (const g of picked) {
      try {
        await resolveEventMatchGroup(g.pairs.map((p) => p.match_id), action);
        ok++;
      } catch (error) {
        if ((error as any)?.response?.status === 404) ok++;
        else failed++;
      }
    }
    setSelectedGroups(new Set());
    setBulkBusy(false);
    notify(failed === 0
      ? `${ok} group${ok === 1 ? '' : 's'} ${action === 'delete_all' ? 'deleted' : 'kept'}.`
      : `${ok} done, ${failed} failed — the rest are still in the list.`, failed > 0);
    fetchGroups(0, Math.min(100, Math.max(PAGE_SIZE, groups.length)), true);
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

  return (
    <div className="w-full flex h-full font-montserrat">
      <AdminSideBar currentPage="duplicates" />
      <div className="px-8 pt-8 h-full flex flex-col w-full text-off-white overflow-x-auto">
        <nav className="border-b-4 border-beaming-orange flex justify-start items-center pb-3 gap-4">
          <div className="text-5xl font-bold px-3">Duplicates</div>
          {!isLoading && view === 'pairs' && (
            <div className="text-lg text-stone-gray self-end pb-1">
              {totalGroups} group{totalGroups === 1 ? '' : 's'} to review ({pendingTotal} pair{pendingTotal === 1 ? '' : 's'})
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
            ? 'Each group is one event the system found more than once, by title, place, date or the same flyer. Keep one (the rest are hidden, restorable), keep all, or delete all. A decision also covers the other dates of the same posts.'
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
                onClick={() => (view === 'pairs' ? fetchGroups(0) : fetchFlagged())}
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
          ) : groups.length === 0 ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
              <div className="text-2xl font-bold">All caught up 🎉</div>
              <div className="text-stone-gray">No duplicates left to review.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 max-w-6xl">
              {/* Bulk toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.size > 0 && selectedGroups.size === groups.length}
                    onChange={(e) =>
                      setSelectedGroups(e.target.checked
                        ? new Set(groups.map((g) => g.key))
                        : new Set())}
                  />
                  Select all loaded
                </label>
                {selectedGroups.size > 0 && (
                  <>
                    <span className="text-stone-gray text-sm">{selectedGroups.size} selected</span>
                    <button
                      className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 text-sm"
                      onClick={() => bulkGroups('keep_all')}
                      disabled={bulkBusy}
                    >
                      Keep all of each
                    </button>
                    <button
                      className="py-1 px-3 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50 text-sm"
                      onClick={() => bulkGroups('delete_all')}
                      disabled={bulkBusy}
                    >
                      Delete all of each
                    </button>
                    {bulkBusy && <Spinner colorClass="text-beaming-orange" size={18} />}
                  </>
                )}
              </div>

              {groups.map((g) => {
                const busy = busyIds.has(g.key) || bulkBusy;
                const best = g.pairs.reduce((m, p) => Math.max(m, p.score), 0);
                const samePost = g.pairs.some((p) => p.match_type === 'exact_link');
                return (
                  <div key={g.key} className="p-6 bg-stone-gray bg-opacity-20 rounded-2xl">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(g.key)}
                        onChange={() => toggleGroup(g.key)}
                      />
                      <span className="text-beaming-orange font-bold uppercase text-sm tracking-wide">
                        {g.events.length} listings, one event
                      </span>
                      <span className="text-stone-gray text-sm">
                        {samePost ? 'same Instagram post' : `up to ${Math.round(best)}% match`}
                        {g.soonest ? ` · ${new Date(g.soonest + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                      </span>
                      <span className="flex-1" />
                      <button
                        className="py-2 px-4 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 whitespace-nowrap"
                        onClick={() => resolveGroup(g, 'keep_all')}
                        disabled={busy}
                      >
                        Keep all
                      </button>
                      <button
                        className="py-2 px-4 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50 whitespace-nowrap"
                        onClick={() => resolveGroup(g, 'delete_all')}
                        disabled={busy}
                      >
                        Delete all
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      {g.events.map((ev) => (
                        <div key={ev.id} className="flex flex-col items-center gap-3">
                          <div className="w-56">
                            <EventCard event={ev} disabled={false} isFavorite={false} />
                          </div>
                          <button
                            className="py-2 px-4 w-56 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                            onClick={() => resolveGroup(g, 'keep', ev.id)}
                            disabled={busy}
                          >
                            Keep this one
                          </button>
                        </div>
                      ))}
                    </div>

                    {busy && (
                      <div className="flex justify-center mt-3">
                        <Spinner colorClass="text-beaming-orange" size={20} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Owner: "when you get to the bottom of the page it should load more events" */}
              {groups.length < totalGroups && (
                <div className="flex justify-center">
                  <button
                    className="py-2 px-6 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50"
                    onClick={() => fetchGroups(groups.length)}
                    disabled={bulkBusy}
                  >
                    Load more ({groups.length} of {totalGroups})
                  </button>
                </div>
              )}
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
