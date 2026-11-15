import { useCallback, useState } from 'react';

export const HEART_POP_MS = 90;

// key={heartPopKey} remounts the icon so a second click replays immediately.
export function useHeartPop() {
  const [popKey, setPopKey] = useState(0);
  const pop = useCallback(() => setPopKey((k) => k + 1), []);

  return {
    pop,
    heartPopKey: popKey,
    heartPopClass: popKey > 0 ? 'animate-heart-pop' : '',
  };
}
