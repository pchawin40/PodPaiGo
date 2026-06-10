import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';
import { beginAiParseRequest, resetAiParseBudgetForTests } from '../../../../lib/ai/tripParseBudget';
import { parseTripText } from '../../../../lib/ai/parseTripText';
import { extractTripIntents } from '../../../../lib/ai/tripIntents';
import {
  clientRequestedLiveAi,
  getAiParseRemainingToday,
  resolveAiEntitlements,
} from '../../../../lib/ai/aiEntitlements';
import { resolveUserPlan } from '../../../../lib/auth/userPlan';
import {
  getAiAssistantProvider,
  isAiAssistantDisabled,
} from '../../../../lib/ai/tripParseConfig';

export const runtime = 'nodejs';

export { resetAiParseBudgetForTests };

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let body: {
      userText?: unknown;
      sessionId?: unknown;
      forceLive?: unknown;
      live?: unknown;
      provider?: unknown;
      aiMode?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'invalid_request_body', 'Expected JSON body with userText.');
    }

    if (clientRequestedLiveAi(body as Record<string, unknown>)) {
      return jsonError(
        400,
        'live_ai_not_client_configurable',
        'Live AI provider selection is server-controlled.',
      );
    }

    const userText = typeof body.userText === 'string' ? body.userText : '';
    if (!userText.trim()) {
      return jsonError(400, 'missing_user_text', 'userText is required.');
    }

    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim().slice(0, 120)
        : null;

    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
    const authClient = createSupabaseAuthClient(accessToken);
    let userId: string | null = null;

    if (authClient && accessToken) {
      const { data } = await authClient.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const plan = resolveUserPlan({ userId });
    const entitlements = resolveAiEntitlements({ userId });
    const remainingToday = await getAiParseRemainingToday({ userId, sessionId });

    beginAiParseRequest();

    const parsed = await parseTripText(userText, { userId, sessionId, plan });

    // Layer multi-intent extraction on top of the single parse. For a one-trip
    // message this just enriches the parse (event venue, lodging origin, driving
    // preferences); for several trips it returns one intent per trip.
    const extraction = extractTripIntents(userText, { basePrimaryParsed: parsed });
    const primaryIntent =
      extraction.intents.find((intent) => intent.id === extraction.primaryIntentId) ??
      extraction.intents[0] ??
      null;
    const primaryParsed = primaryIntent?.parsed ?? parsed;

    return NextResponse.json({
      ...primaryParsed,
      intents: extraction.intents,
      originalText: extraction.originalText,
      primaryIntentId: extraction.primaryIntentId,
      assistantDisabled: isAiAssistantDisabled(),
      configuredProvider: getAiAssistantProvider(),
      liveProviderActive: entitlements.providerUsed === 'openai',
      providerUsed: entitlements.providerUsed,
      plan: entitlements.plan,
      mode: entitlements.mode,
      assistantLabel: entitlements.assistantLabel,
      remainingToday,
      requiresConfirmation: true,
    });
  } catch (error) {
    return jsonError(
      500,
      'parse_failed',
      error instanceof Error ? error.message : 'Trip parse failed.',
    );
  }
}
