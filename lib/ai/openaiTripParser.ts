import { getOpenAiApiKey, getOpenAiTripParseModel } from './tripParseConfig';
import {
  computeMissingParsedFields,
  normalizeParsedTripAssistantResult,
} from './normalizeParsedTrip';
import type { ParsedTripAssistantResult } from './tripParseTypes';

const SYSTEM_PROMPT =
  'Extract airport trip planning fields from user text. Return JSON only with keys: originText, airportCode, destinationCity, airlineText, departureDate, departureTime, returnDate, returnTime, tripType, needsParking, needsLeaveTime, confidence, missingFields. Use ISO dates (YYYY-MM-DD) and 24h times (HH:MM) when possible.';

export type OpenAiParseResult = {
  parsed: ParsedTripAssistantResult | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  errorCode?: string | null;
};

export async function parseTripTextOpenAi(userText: string): Promise<OpenAiParseResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { parsed: null, errorCode: 'missing_api_key' };
  }

  const model = getOpenAiTripParseModel();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
      }),
    });

    if (!response.ok) {
      return { parsed: null, errorCode: `openai_http_${response.status}` };
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { parsed: null, errorCode: 'openai_empty_content' };
    }

    const raw = JSON.parse(content) as unknown;
    const normalized = normalizeParsedTripAssistantResult(raw, 'openai');
    if (!normalized) {
      return { parsed: null, errorCode: 'openai_invalid_schema' };
    }

    const usage = json?.usage ?? {};
    const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const completionTokens =
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;
    const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : null;

    return {
      parsed: computeMissingParsedFields(normalized),
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: null,
      errorCode: null,
    };
  } catch (error) {
    return {
      parsed: null,
      errorCode: error instanceof Error ? error.message : 'openai_request_failed',
    };
  }
}
