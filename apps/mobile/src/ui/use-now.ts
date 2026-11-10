import { useEffect, useState } from 'react';

/** The current time, read fresh at every render, with a re-render every `everyMs` while `active` (so ages keep counting). */
export function useNow(active: boolean, everyMs = 1000): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => tick(count => count + 1), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return Date.now();
}
