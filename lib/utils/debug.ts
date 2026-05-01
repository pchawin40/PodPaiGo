// lib/utils/debug.ts
export const DEBUG = process.env.DEBUG_LOGS === 'true';

export function debugLog(...args: unknown[]) {
  if (DEBUG) {
    console.log(...args);
  }
}