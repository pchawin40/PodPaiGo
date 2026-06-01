// lib/utils/debug.ts
export const DEBUG = process.env.DEBUG_LOGS === 'true';

export function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}

/** Client-safe gate for internal diagnostics that must never ship to normal users. */
export function isPodPaiGoDebugUIEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.NEXT_PUBLIC_PODPAIGO_DEBUG === '1';
}