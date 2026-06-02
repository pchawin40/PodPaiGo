import type { ProviderCallLog } from './types';

const callLog: ProviderCallLog[] = [];
const MAX_LOG_ENTRIES = 500;

export function logProviderCall(entry: ProviderCallLog): void {
  const row: ProviderCallLog = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  callLog.push(row);
  if (callLog.length > MAX_LOG_ENTRIES) {
    callLog.splice(0, callLog.length - MAX_LOG_ENTRIES);
  }

  console.log('[api-usage]', {
    provider: row.provider,
    requestKey: row.requestKey,
    cache_hit: row.cacheHit === true,
    snapshot_hit: row.snapshotHit === true,
    live_call: row.liveCall === true,
    blocked_by_budget: row.blockedByBudget === true,
    blocked_by_kill_switch: row.blockedByKillSwitch === true,
    estimated_cost: row.estimatedCost ?? 0,
    timestamp: row.timestamp,
    note: row.note,
  });
}

export function getRecentProviderCalls(limit = 50): ProviderCallLog[] {
  return callLog.slice(-limit);
}

export function clearProviderCallLog(): void {
  callLog.length = 0;
}
