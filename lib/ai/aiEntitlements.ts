import { resolveUserPlan, type UserPlan } from '../auth/userPlan';
import {
  getMaxAiParseCallsPerAnonDay,
  getMaxAiParseCallsPerUserDay,
  getAiAssistantProvider,
  getOpenAiApiKey,
  isAiAssistantDisabled,
} from './tripParseConfig';
import { countAiUsageSince } from './aiUsageLogger';

export type AiMode = 'mock' | 'live';

function utcDayStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function resolveAiMode(plan: UserPlan): AiMode {
  if (isAiAssistantDisabled()) return 'mock';
  if (plan === 'anonymous' || plan === 'free') return 'mock';
  if (
    (plan === 'plus' || plan === 'pro' || plan === 'admin') &&
    getAiAssistantProvider() === 'openai' &&
    getOpenAiApiKey()
  ) {
    return 'live';
  }
  return 'mock';
}

export function resolveAiProviderForRequest(plan: UserPlan): 'mock' | 'openai' {
  return resolveAiMode(plan) === 'live' ? 'openai' : 'mock';
}

export function getAiAssistantLabel(mode: AiMode): string {
  if (isAiAssistantDisabled()) return 'Assistant disabled';
  return mode === 'live' ? 'AI assistant' : 'Basic assistant';
}

export function getUpgradeFriendlyLimitMessage(plan: UserPlan): string {
  if (plan === 'anonymous') {
    return 'Daily assistant limit reached. Sign in for more help, or try again tomorrow.';
  }

  if (plan === 'free') {
    return 'Daily assistant limit reached on the free plan. Upgrade-friendly note: live AI tiers are coming soon.';
  }

  return 'Daily assistant limit reached. Try again tomorrow.';
}

export async function getAiParseRemainingToday(input: {
  userId?: string | null;
  sessionId?: string | null;
}): Promise<number | null> {
  const plan = resolveUserPlan({ userId: input.userId });
  const limit =
    plan === 'anonymous'
      ? getMaxAiParseCallsPerAnonDay()
      : getMaxAiParseCallsPerUserDay();

  if (limit === 0) return 0;

  const sinceIso = utcDayStartIso();
  const used = await countAiUsageSince(sinceIso, input);
  return Math.max(0, limit - used);
}

export function resolveAiEntitlements(input: {
  userId?: string | null;
  email?: string | null;
}): {
  plan: UserPlan;
  mode: AiMode;
  providerUsed: 'mock' | 'openai';
  assistantLabel: string;
} {
  const plan = resolveUserPlan(input);
  const mode = resolveAiMode(plan);
  const providerUsed = resolveAiProviderForRequest(plan);

  return {
    plan,
    mode,
    providerUsed,
    assistantLabel: getAiAssistantLabel(mode),
  };
}

export function clientRequestedLiveAi(body: Record<string, unknown>): boolean {
  return (
    body.forceLive === true ||
    body.live === true ||
    body.provider === 'openai' ||
    body.aiMode === 'live'
  );
}
