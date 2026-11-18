"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
}

// Rounded to the minute so the snapshot is stable between renders.
const getSnapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;
// Prerendering (Cache Components) must not read the clock; the server
// snapshot is null and the browser fills in the real time on hydration.
const getServerSnapshot = () => null;

/** Current time in the browser, or null while prerendering. */
export function useNow(): Date | null {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return now === null ? null : new Date(now);
}
