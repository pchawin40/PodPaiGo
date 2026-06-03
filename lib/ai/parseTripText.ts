import { checkAiDailyBudget, recordAiDailyBudgetUse } from './aiDailyBudget';
import { logAiUsageEvent } from './aiUsageLogger';
import { parseTripTextMock } from './mockTripParser';
import { parseTripTextOpenAi } from './openaiTripParser';
import { logAiParseEvent } from './tripParseLogger';
import {
  getAiAssistantProvider,
  getMaxAiParseInputChars,
  isAiAssistantDisabled,
} from './tripParseConfig';
import { resolveAiProviderForRequest } from './aiEntitlements';
import { resolveUserPlan } from '../auth/userPlan';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import { tryConsumeAiParseCall } from './tripParseBudget';

export type ParseTripTextOptions = {
  userId?: string | null;
  sessionId?: string | null;
  plan?: import('../auth/userPlan').UserPlan;
};

function emptyParsedResult(parser: ParsedTripAssistantResult['parser']): ParsedTripAssistantResult {
  return {
    originText: null,
    airportCode: null,
    destinationCity: null,
    airlineText: null,
    departureDate: null,
    departureTime: null,
    returnDate: null,
    returnTime: null,
    tripType: null,
    needsParking: false,
    needsLeaveTime: true,
    confidence: 'low',
    missingFields: ['userText'],
    parser,
  };
}

function budgetBlockedResult(reason: string): ParsedTripAssistantResult {
  return {
    ...parseTripTextMock(''),
    parser: 'mock',
    confidence: 'low',
    missingFields: [reason],
  };
}

export async function parseTripText(
  userText: string,
  options: ParseTripTextOptions = {},
): Promise<ParsedTripAssistantResult> {
  const trimmed = userText.trim();
  const plan = options.plan ?? resolveUserPlan({ userId: options.userId });
  const providerForRequest = resolveAiProviderForRequest(plan);
  const parserLabel = isAiAssistantDisabled() ? 'disabled' : providerForRequest;

  if (!trimmed) {
    logAiParseEvent('ai_parse_failed', { reason: 'empty_input' });
    return emptyParsedResult(isAiAssistantDisabled() ? 'disabled' : 'mock');
  }

  if (trimmed.length > getMaxAiParseInputChars()) {
    logAiParseEvent('ai_parse_failed', { reason: 'input_too_long' });
    await logAiUsageEvent({
      userId: options.userId,
      sessionId: options.sessionId,
      provider: parserLabel,
      model: null,
      inputChars: trimmed.length,
      success: false,
      errorCode: 'input_too_long',
    });
    return {
      ...budgetBlockedResult('inputTooLong'),
      missingFields: ['inputTooLong'],
    };
  }

  const dailyBudget = await checkAiDailyBudget({
    userId: options.userId,
    sessionId: options.sessionId,
  });

  if (!dailyBudget.allowed) {
    logAiParseEvent('ai_parse_failed', { reason: dailyBudget.reason || 'daily_limit_exceeded' });
    await logAiUsageEvent({
      userId: options.userId,
      sessionId: options.sessionId,
      provider: parserLabel,
      model: null,
      inputChars: trimmed.length,
      success: false,
      errorCode: dailyBudget.reason || 'daily_limit_exceeded',
    });
    return {
      ...budgetBlockedResult('dailyLimit'),
      missingFields: ['dailyLimit'],
    };
  }

  if (!tryConsumeAiParseCall()) {
    logAiParseEvent('ai_parse_failed', { reason: 'request_budget_exceeded' });
    return {
      ...budgetBlockedResult('requestBudget'),
      missingFields: ['requestBudget'],
    };
  }

  logAiParseEvent('ai_parse_attempt', {
    provider: providerForRequest,
    disabled: isAiAssistantDisabled(),
  });

  try {
    if (!isAiAssistantDisabled() && providerForRequest === 'openai') {
      const openAiResult = await parseTripTextOpenAi(trimmed);
      recordAiDailyBudgetUse({
        userId: options.userId,
        sessionId: options.sessionId,
      });

      if (openAiResult.parsed) {
        await logAiUsageEvent({
          userId: options.userId,
          sessionId: options.sessionId,
          provider: 'openai',
          model: process.env.OPENAI_TRIP_PARSE_MODEL || 'gpt-4o-mini',
          inputChars: trimmed.length,
          promptTokens: openAiResult.promptTokens,
          completionTokens: openAiResult.completionTokens,
          totalTokens: openAiResult.totalTokens,
          estimatedCost: openAiResult.estimatedCost,
          success: true,
        });
        logAiParseEvent('ai_parse_success', { parser: 'openai' });
        return openAiResult.parsed;
      }

      await logAiUsageEvent({
        userId: options.userId,
        sessionId: options.sessionId,
        provider: 'openai',
        model: process.env.OPENAI_TRIP_PARSE_MODEL || 'gpt-4o-mini',
        inputChars: trimmed.length,
        success: false,
        errorCode: openAiResult.errorCode || 'openai_failed',
      });
    }

    const mockResult = parseTripTextMock(trimmed);
    recordAiDailyBudgetUse({
      userId: options.userId,
      sessionId: options.sessionId,
    });
    await logAiUsageEvent({
      userId: options.userId,
      sessionId: options.sessionId,
      provider: 'mock',
      model: null,
      inputChars: trimmed.length,
      success: true,
    });
    logAiParseEvent('ai_parse_mock_used', {
      confidence: mockResult.confidence,
      missingFields: mockResult.missingFields,
    });
    logAiParseEvent('ai_parse_success', { parser: 'mock' });
    return mockResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    logAiParseEvent('ai_parse_failed', { reason: message });
    await logAiUsageEvent({
      userId: options.userId,
      sessionId: options.sessionId,
      provider: getAiAssistantProvider(),
      model: process.env.OPENAI_TRIP_PARSE_MODEL || 'gpt-4o-mini',
      inputChars: trimmed.length,
      success: false,
      errorCode: message,
    });

    return {
      ...parseTripTextMock(trimmed),
      parser: 'mock',
      confidence: 'low',
    };
  }
}
