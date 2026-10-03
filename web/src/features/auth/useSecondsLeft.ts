import { useEffect, useState } from 'react';

/** Whole seconds until `deadline` (epoch ms), rounded up and re-read once a second. Zero when idle or past. */
export function useSecondsLeft(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}
