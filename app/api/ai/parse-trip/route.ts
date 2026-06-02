import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '../../../../lib/monetization/recordOutboundClick';
import { beginAiParseRequest, resetAiParseBudgetForTests } from '../../../../lib/ai/tripParseBudget';
import { parseTripText } from '../../../../lib/ai/parseTripText';
import {
  getAiAssistantProvider,
  isAiAssistantDisabled,
  isLiveAiAssistantActive,
} from '../../../../lib/ai/tripParseConfig';

export const runtime = 'nodejs';

export { resetAiParseBudgetForTests };

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let body: { userText?: unknown; sessionId?: unknown };

    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'invalid_request_body', 'Expected JSON body with userText.');
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

    beginAiParseRequest();

    const parsed = await parseTripText(userText, { userId, sessionId });

    return NextResponse.json({
      ...parsed,
      assistantDisabled: isAiAssistantDisabled(),
      liveProviderActive: isLiveAiAssistantActive(),
      configuredProvider: getAiAssistantProvider(),
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
