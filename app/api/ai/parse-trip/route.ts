import { NextRequest, NextResponse } from 'next/server';
import { beginAiParseRequest, resetAiParseBudgetForTests } from '../../../../lib/ai/tripParseBudget';
import { parseTripText } from '../../../../lib/ai/parseTripText';
import { isAiAssistantDisabled } from '../../../../lib/ai/tripParseConfig';

export const runtime = 'nodejs';

export { resetAiParseBudgetForTests };

function jsonError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    let body: { userText?: unknown };

    try {
      body = await request.json();
    } catch {
      return jsonError(400, 'invalid_request_body', 'Expected JSON body with userText.');
    }

    const userText = typeof body.userText === 'string' ? body.userText : '';
    if (!userText.trim()) {
      return jsonError(400, 'missing_user_text', 'userText is required.');
    }

    beginAiParseRequest();

    const parsed = await parseTripText(userText);

    return NextResponse.json({
      ...parsed,
      assistantDisabled: isAiAssistantDisabled(),
    });
  } catch (error) {
    return jsonError(
      500,
      'parse_failed',
      error instanceof Error ? error.message : 'Trip parse failed.',
    );
  }
}
