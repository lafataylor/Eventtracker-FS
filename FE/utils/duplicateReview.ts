// Keyboard review on /admin/duplicates (owner 2026-11-14):
// the fuller flyer starts selected, Enter keeps it and hops to the next
// group, arrows pick a different card, Space pins an extra listing so
// two of three can stay.

export function initialKeepId(
  eventIds: number[],
  suggestedKeepId?: number | null,
): number | null {
  if (suggestedKeepId != null && eventIds.includes(suggestedKeepId)) {
    return suggestedKeepId;
  }
  return eventIds[0] ?? null;
}

export function moveFocus(
  eventIds: number[],
  current: number | null,
  direction: -1 | 1,
): number | null {
  if (eventIds.length === 0) {
    return null;
  }
  const at = current == null ? -1 : eventIds.indexOf(current);
  const start = at < 0 ? 0 : at;
  const next = (start + direction + eventIds.length) % eventIds.length;
  return eventIds[next];
}

export function arrowPicks(
  eventIds: number[],
  picks: number[],
  focus: number | null,
  direction: -1 | 1,
  pinningExtras: boolean,
): { picks: number[]; focus: number | null } {
  const nextFocus = moveFocus(eventIds, focus, direction);
  if (!pinningExtras && picks.length <= 1) {
    return { picks: nextFocus == null ? [] : [nextFocus], focus: nextFocus };
  }
  return { picks, focus: nextFocus };
}

/** Space pins or unpins the focused card. Never leaves the set empty. */
export function togglePinned(picks: number[], id: number): number[] {
  if (picks.includes(id)) {
    const next = picks.filter((x) => x !== id);
    return next.length > 0 ? next : picks;
  }
  return picks.concat(id);
}

export type ReviewKeyAction =
  | { type: 'keep' }
  | { type: 'keep_all' }
  | { type: 'delete_all' }
  | { type: 'arrow'; direction: -1 | 1 }
  | { type: 'pin' };

// Enter keeps the highlighted flyer. [ and ] sit next to Return, so they
// are Keep all and Delete all. Arrows stay on picking a card — a right
// arrow must not keep-all or you could not choose a different flyer
// (owner 2026-11-14).
export function reviewKeyAction(key: string): ReviewKeyAction | null {
  if (key === 'Enter') return { type: 'keep' };
  if (key === '[') return { type: 'keep_all' };
  if (key === ']') return { type: 'delete_all' };
  if (key === 'ArrowLeft') return { type: 'arrow', direction: -1 };
  if (key === 'ArrowRight') return { type: 'arrow', direction: 1 };
  if (key === ' ' || key === 'Spacebar') return { type: 'pin' };
  return null;
}

export function idsToKeep(picks: number[], focus: number | null): number[] {
  const ids = picks.length > 0 ? picks.slice() : [];
  if (focus != null && !ids.includes(focus) && picks.length <= 1) {
    return [focus];
  }
  if (focus != null && picks.length > 1 && !ids.includes(focus)) {
    ids.push(focus);
  }
  return ids;
}
