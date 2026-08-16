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

const MATCH_LABEL: Record<string, string> = {
  fuzzy: 'Similar event',
  exact_link: 'Same Instagram post',
  phash: 'Similar flyer',
};

const Index = () => {
  const [state, dispatch] = useStore();
  const { loader, actionDialog, auth } = state;
  const { overlay } = auth;

  const [matches, setMatches] = useState<Match[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A set, not a scalar: resolving two cards at once must keep both disabled
  // independently (a scalar re-enabled the first card mid-flight).
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const notify = (message: string, isError = false) =>
    dispatch({ type: SHOW_INFO_OVERLAY, payload: { message, isError } });

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
    fetchMatches();
  }, []);

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
      const remaining = matches.filter((m) =>
        m.match_id !== match.match_id &&
        (suppressedId == null ||
          (m.event_a.id !== suppressedId && m.event_b.id !== suppressedId))
      );
      const removed = matches.length - remaining.length;
      setMatches(remaining);
      setPendingTotal((n) => Math.max(0, n - removed));
      notify(
        action === 'not_duplicate'
          ? 'Marked as not duplicates — both kept.'
          : 'Duplicate hidden. You can restore it later.',
        false
      );
      // If this batch of 50 is exhausted but more remain server-side, pull the
      // next page instead of showing a false "all caught up".
      if (remaining.length === 0) {
        fetchMatches();
      }
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
          {!isLoading && (
            <div className="text-lg text-stone-gray self-end pb-1">
              {pendingTotal} pair{pendingTotal === 1 ? '' : 's'} to review
            </div>
          )}
        </nav>

        <p className="mt-4 px-3 text-stone-gray max-w-3xl">
          These look like the same event posted twice. Compare them, then keep the
          better one — the other is hidden from the site (and can be restored).
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
                onClick={fetchMatches}
              >
                Try again
              </button>
            </div>
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
