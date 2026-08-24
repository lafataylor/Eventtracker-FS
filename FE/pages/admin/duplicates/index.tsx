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
  // wrongly hidden by the old logic can be restored (the new pairs view only
  // covers EventMatch rows, which the old scraper never created).
  const [flagged, setFlagged] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A set, not a scalar: resolving two cards at once must keep both disabled
  // independently (a scalar re-enabled the first card mid-flight).
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const notify = (message: string, isError = false) =>
    dispatch({ type: SHOW_INFO_OVERLAY, payload: { message, isError } });

  const fetchFlagged = async () => {
    if (!(await requestMiddleware(dispatch))) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await readAdminDuplicates();
      if (res.status === 200) {
        setFlagged(res.data?.duplicate_events || []);
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

  const resolve = async (match: Match, action: 'keep_a' | 'keep_b' | 'not_duplicate') => {
    if (!(await requestMiddleware(dispatch))) return;
    setBusyIds((prev) => new Set(prev).add(match.match_id));
    try {
      await resolveEventMatch(match.match_id, action);
      // The event that got suppressed by this verdict (none for not_duplicate).
      const suppressedId =
        action === 'keep_a' ? match.event_b.id
        : action === 'keep_b' ? match.event_a.id
        : null;
      // Drop the resolved pair AND any other pending pair that references the
      // now-suppressed event — otherwise a sibling pair would still offer to
      // "keep" it and silently un-hide it.
      //
      // Kept pure: React may invoke state updaters more than once (StrictMode
      // does), so no side effects are allowed inside them — an earlier version
      // decremented pendingTotal inside the updater and double-counted.
      const keepPair = (m: Match) =>
        m.match_id !== match.match_id &&
        (suppressedId == null ||
          (m.event_a.id !== suppressedId && m.event_b.id !== suppressedId));
      // One filter pass; both state updates derive from it. Updaters stay
      // pure (StrictMode re-invokes them), and pendingTotal is an optimistic
      // display value that self-heals on the next fetch; the empty-batch
      // refetch is handled by the effect above, on committed state.
      const next = matches.filter(keepPair);
      setMatches(next);
      setPendingTotal((n) => Math.max(0, n - (matches.length - next.length)));
      notify(
        action === 'not_duplicate'
          ? 'Marked as not duplicates — both kept.'
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
            flagged.length === 0 ? (
              <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
                <div className="text-2xl font-bold">Nothing flagged 🎉</div>
                <div className="text-stone-gray">No previously-hidden events to review.</div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6">
                {flagged.map((event) => (
                  <div
                    key={`flagged-${event.id}`}
                    className="p-4 bg-stone-gray bg-opacity-20 rounded-2xl flex flex-col items-center gap-3"
                  >
                    <div className="w-64">
                      <EventCard event={event} disabled={false} isFavorite={false} />
                    </div>
                    <button
                      className="py-2 px-4 w-64 rounded-lg bg-beaming-orange text-black font-semibold disabled:opacity-50"
                      onClick={() => restore(event.id)}
                      disabled={busyIds.has(event.id)}
                    >
                      Restore to site
                    </button>
                    <button
                      className="py-2 px-4 w-64 rounded-lg border border-stone-gray text-off-white hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                      onClick={() => removeForever(event.id)}
                      disabled={busyIds.has(event.id)}
                    >
                      Delete permanently
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : matches.length === 0 ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
              <div className="text-2xl font-bold">All caught up 🎉</div>
              <div className="text-stone-gray">No duplicates left to review.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-8 max-w-5xl">
              {matches.map((m) => {
                const busy = busyIds.has(m.match_id);
                return (
                  <div
                    key={m.match_id}
                    className="p-6 bg-stone-gray bg-opacity-20 rounded-2xl"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-beaming-orange font-bold uppercase text-sm tracking-wide">
                        {MATCH_LABEL[m.match_type] || 'Possible duplicate'}
                      </span>
                      <span className="text-stone-gray text-sm">
                        {Math.round(m.score)}% match
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

                      {/* Middle divider / not-a-duplicate */}
                      <div className="flex md:flex-col items-center justify-center gap-3 px-2">
                        <span className="text-stone-gray font-bold">vs</span>
                        <button
                          className="py-2 px-4 rounded-lg border border-stone-gray text-off-white hover:border-beaming-orange disabled:opacity-50 whitespace-nowrap"
                          onClick={() => resolve(m, 'not_duplicate')}
                          disabled={busy}
                        >
                          Not duplicates
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
