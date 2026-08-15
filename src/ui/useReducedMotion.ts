"use client";

import { useSyncExternalStore } from "react";

/**
 * SPEC.md §6/§11/§12: prefers-reduced-motion is re-checked LIVE via a
 * matchMedia listener, not just at page load — toggling the OS setting
 * mid-session must switch to the static rung immediately.
 *
 * useSyncExternalStore (not useState+useEffect) because this is exactly its
 * intended use case: a mutable external source (matchMedia) that must read
 * consistently across server prerender, hydration, and live updates without
 * a hydration-mismatch flash or a setState-in-effect render cascade.
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
