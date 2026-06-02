import {
  getMaxAiParseCallsPerAnonDay,
  getMaxAiParseCallsPerUserDay,
} from './tripParseConfig';
import { countAiUsageSince } from './aiUsageLogger';

const memoryCounts = new Map<string, number>();

function utcDayStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function memoryKey(filter: { userId?: string | null; sessionId?: string | null }): string {
  const day = utcDayStartIso().slice(0, 10);
  if (filter.userId) return `user:${filter.userId}:${day}`;
  return `anon:${filter.sessionId || 'unknown'}:${day}`;
}

export function resetAiDailyBudgetForTests(): void {
  memoryCounts.clear();
}

export async function checkAiDailyBudget(filter: {
  userId?: string | null;
  sessionId?: string | null;
}): Promise<{ allowed: boolean; reason?: string }> {
  const limit = filter.userId
    ? getMaxAiParseCallsPerUserDay()
    : getMaxAiParseCallsPerAnonDay();

  if (limit === 0) {
    return { allowed: false, reason: 'daily_limit_zero' };
  }

  const sinceIso = utcDayStartIso();
  const dbCount = await countAiUsageSince(sinceIso, filter);
  const key = memoryKey(filter);
  const memoryCount = memoryCounts.get(key) ?? 0;
  const total = Math.max(dbCount, memoryCount);

  if (total >= limit) {
    return { allowed: false, reason: 'daily_limit_exceeded' };
  }

  return { allowed: true };
}

export function recordAiDailyBudgetUse(filter: {
  userId?: string | null;
  sessionId?: string | null;
}): void {
  const key = memoryKey(filter);
  memoryCounts.set(key, (memoryCounts.get(key) ?? 0) + 1);
}
