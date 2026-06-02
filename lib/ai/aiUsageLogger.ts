export type AiUsageEventInput = {
  userId?: string | null;
  sessionId?: string | null;
  provider: string;
  model?: string | null;
  inputChars?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  success?: boolean;
  errorCode?: string | null;
};

function hasDatabaseUrl(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim() ||
      process.env.LOCAL_DATABASE_URL?.trim(),
  );
}

export async function logAiUsageEvent(event: AiUsageEventInput): Promise<void> {
  if (!hasDatabaseUrl()) return;

  try {
    const { getDb } = await import('../db/client');
    const pool = getDb();

    await pool.query(
      `insert into public.ai_usage_events (
        user_id,
        session_id,
        provider,
        model,
        input_chars,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost,
        success,
        error_code
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.userId ?? null,
        event.sessionId ?? null,
        event.provider,
        event.model ?? null,
        event.inputChars ?? null,
        event.promptTokens ?? null,
        event.completionTokens ?? null,
        event.totalTokens ?? null,
        event.estimatedCost ?? null,
        event.success !== false,
        event.errorCode ?? null,
      ],
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[ai-usage] failed to log event', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }
}

export async function countAiUsageSince(
  sinceIso: string,
  filter: { userId?: string | null; sessionId?: string | null },
): Promise<number> {
  if (!hasDatabaseUrl()) return 0;

  try {
    const { getDb } = await import('../db/client');
    const pool = getDb();

    if (filter.userId) {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
         from public.ai_usage_events
         where user_id = $1
           and created_at >= $2`,
        [filter.userId, sinceIso],
      );
      return Number(result.rows[0]?.count || 0);
    }

    if (filter.sessionId) {
      const result = await pool.query<{ count: string }>(
        `select count(*)::text as count
         from public.ai_usage_events
         where user_id is null
           and session_id = $1
           and created_at >= $2`,
        [filter.sessionId, sinceIso],
      );
      return Number(result.rows[0]?.count || 0);
    }

    return 0;
  } catch {
    return 0;
  }
}
