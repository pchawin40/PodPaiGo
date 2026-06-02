import { getAiAssistantProvider, getOpenAiApiKey, isAiAssistantDisabled } from './tripParseConfig';
import { logAiParseEvent } from './tripParseLogger';
import { parseTripTextMock } from './mockTripParser';
import type { ParsedTripAssistantResult } from './tripParseTypes';
import { tryConsumeAiParseCall } from './tripParseBudget';

async function parseTripTextOpenAi(userText: string): Promise<ParsedTripAssistantResult | null> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TRIP_PARSE_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Extract airport trip planning fields from user text. Return JSON with keys: originText, airportCode, destinationCity, airlineText, departureDate, departureTime, returnDate, returnTime, tripType, needsParking, needsLeaveTime, confidence, missingFields.',
        },
        { role: 'user', content: userText },
      ],
    }),
  });

  if (!response.ok) return null;

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return null;

  const parsed = JSON.parse(content) as Partial<ParsedTripAssistantResult>;
  return {
    originText: parsed.originText ?? null,
    airportCode: parsed.airportCode?.toUpperCase?.() ?? null,
    destinationCity: parsed.destinationCity ?? null,
    airlineText: parsed.airlineText ?? null,
    departureDate: parsed.departureDate ?? null,
    departureTime: parsed.departureTime ?? null,
    returnDate: parsed.returnDate ?? null,
    returnTime: parsed.returnTime ?? null,
    tripType: parsed.tripType ?? null,
    needsParking: parsed.needsParking === true,
    needsLeaveTime: parsed.needsLeaveTime !== false,
    confidence: parsed.confidence ?? 'medium',
    missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map(String) : [],
    parser: 'openai',
  };
}

export async function parseTripText(userText: string): Promise<ParsedTripAssistantResult> {
  const trimmed = userText.trim();
  if (!trimmed) {
    logAiParseEvent('ai_parse_failed', { reason: 'empty_input' });
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
      parser: isAiAssistantDisabled() ? 'disabled' : 'mock',
    };
  }

  if (!tryConsumeAiParseCall()) {
    logAiParseEvent('ai_parse_failed', { reason: 'request_budget_exceeded' });
    return {
      ...parseTripTextMock(trimmed),
      parser: 'mock',
      confidence: 'low',
      missingFields: ['requestBudget'],
    };
  }

  logAiParseEvent('ai_parse_attempt', {
    provider: getAiAssistantProvider(),
    disabled: isAiAssistantDisabled(),
  });

  try {
    if (!isAiAssistantDisabled() && getAiAssistantProvider() === 'openai') {
      const openAiResult = await parseTripTextOpenAi(trimmed);
      if (openAiResult) {
        logAiParseEvent('ai_parse_success', { parser: 'openai' });
        return openAiResult;
      }
    }

    const mockResult = parseTripTextMock(trimmed);
    logAiParseEvent('ai_parse_mock_used', {
      confidence: mockResult.confidence,
      missingFields: mockResult.missingFields,
    });
    logAiParseEvent('ai_parse_success', { parser: 'mock' });
    return mockResult;
  } catch (error) {
    logAiParseEvent('ai_parse_failed', {
      reason: error instanceof Error ? error.message : 'unknown_error',
    });

    return {
      ...parseTripTextMock(trimmed),
      parser: 'mock',
      confidence: 'low',
    };
  }
}
