import { db } from './client';
import { withTimeout } from '../utils/asyncTimeout';
import type { ApiProvider } from '../apiUsage/types';

const API_USAGE_DB_TIMEOUT_MS = Number(process.env.API_USAGE_DB_TIMEOUT_MS || 2000);

function apiUsageDbDisabled(): boolean {
  return process.env.DISABLE_PARKING_DB_CACHE === 'true';
}

export async function readApiUsageCounter(
  provider: ApiProvider,
  periodType: 'daily' | 'monthly',
  periodKey: string,
): Promise<number> {
  if (apiUsageDbDisabled()) return 0;

  try {
    const result = await withTimeout(
      db.query(
        `
        select request_count
        from api_usage_counters
        where provider = $1
          and period_type = $2
          and period_key = $3
        limit 1
        `,
        [provider, periodType, periodKey],
      ),
      API_USAGE_DB_TIMEOUT_MS,
      'API usage counter read',
    );

    if (result.rows.length === 0) return 0;
    return Number(result.rows[0].request_count) || 0;
  } catch {
    return 0;
  }
}

export async function incrementApiUsageCounter(args: {
  provider: ApiProvider;
  periodType: 'daily' | 'monthly';
  periodKey: string;
  estimatedCost: number;
}): Promise<void> {
  if (apiUsageDbDisabled()) return;

  try {
    await withTimeout(
      db.query(
        `
        insert into api_usage_counters (
          provider,
          period_type,
          period_key,
          request_count,
          estimated_cost,
          last_request_at,
          updated_at
        )
        values ($1, $2, $3, 1, $4, now(), now())
        on conflict (provider, period_type, period_key)
        do update set
          request_count = api_usage_counters.request_count + 1,
          estimated_cost = api_usage_counters.estimated_cost + excluded.estimated_cost,
          last_request_at = now(),
          updated_at = now()
        `,
        [args.provider, args.periodType, args.periodKey, args.estimatedCost],
      ),
      API_USAGE_DB_TIMEOUT_MS,
      'API usage counter write',
    );
  } catch {
    // Non-fatal.
  }
}

export async function getApiUsageCounterSummary(): Promise<
  Array<{
    provider: string;
    periodType: string;
    periodKey: string;
    requestCount: number;
    estimatedCost: number;
    lastRequestAt: string | null;
  }>
> {
  if (apiUsageDbDisabled()) return [];

  try {
    const result = await withTimeout(
      db.query(
        `
        select
          provider,
          period_type as "periodType",
          period_key as "periodKey",
          request_count as "requestCount",
          estimated_cost::float8 as "estimatedCost",
          last_request_at::text as "lastRequestAt"
        from api_usage_counters
        order by updated_at desc
        limit 100
        `,
      ),
      API_USAGE_DB_TIMEOUT_MS,
      'API usage summary read',
    );

    return result.rows as Array<{
      provider: string;
      periodType: string;
      periodKey: string;
      requestCount: number;
      estimatedCost: number;
      lastRequestAt: string | null;
    }>;
  } catch {
    return [];
  }
}
