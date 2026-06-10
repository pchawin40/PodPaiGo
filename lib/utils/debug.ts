// lib/utils/debug.ts
export const DEBUG = process.env.DEBUG_LOGS === 'true';

export function debugLog(...args: unknown[]) {
  if (process.env.DEBUG_LOGS === 'true') {
    console.log(...args);
  }
}

/** Client-safe gate for internal diagnostics that must never ship to normal users. */
export function isPodPaiGoDebugUIEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  return (
    process.env.DEBUG_LOGS === 'true' ||
    process.env.NEXT_PUBLIC_DEBUG_UI === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG === 'true' ||
    process.env.ALLOW_LOCAL_ADMIN === 'true'
  );
}
