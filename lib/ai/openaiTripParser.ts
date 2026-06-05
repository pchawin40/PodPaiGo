import { getOpenAiApiKey, getOpenAiTripParseModel } from './tripParseConfig';
import {
  computeMissingParsedFields,
  normalizeParsedTripAssistantResult,
} from './normalizeParsedTrip';
import type { ParsedTripAssistantResult } from './tripParseTypes';

function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TRIP_PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'mode',
    'destinationText',
    'originSource',
    'destinationCategory',
    'destinationKind',
    'originText',
    'airportCode',
    'destinationCity',
    'airlineText',
    'departureDate',
    'departureTime',
    'timeAnchor',
    'returnDate',
    'returnTime',
    'parkingCheckInDate',
    'parkingCheckInTime',
    'parkingCheckOutDate',
    'parkingCheckOutTime',
    'parkingDurationMinutes',
    'transportAvailability',
    'parkingPreference',
    'tripType',
    'needsParking',
    'needsLeaveTime',
    'confidence',
    'missingFields',
  ],
  properties: {
    mode: {
      type: 'string',
      enum: ['airport_trip', 'general_trip', 'quick_go', 'parking_only', 'unknown'],
    },
    destinationText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    originSource: {
      type: 'string',
      enum: ['current_location', 'manual', 'saved', 'unknown'],
    },
    destinationCategory: {
      anyOf: [
        {
          type: 'string',
          enum: [
            'airport',
            'grocery_or_retail',
            'office_or_workplace',
            'hiking_or_park',
            'restaurant',
            'hotel',
            'general',
          ],
        },
        { type: 'null' },
      ],
    },
    destinationKind: {
      anyOf: [
        {
          type: 'string',
          enum: [
            'airport',
            'office',
            'downtown',
            'stadium',
            'event',
            'hospital',
            'restaurant',
            'hotel',
            'general',
          ],
        },
        { type: 'null' },
      ],
    },
    originText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    airportCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    destinationCity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    airlineText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    departureDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    departureTime: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    timeAnchor: {
      type: 'string',
      enum: ['arrive_by', 'depart_at', 'now', 'unknown'],
    },
    returnDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    returnTime: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parkingCheckInDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parkingCheckInTime: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parkingCheckOutDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parkingCheckOutTime: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parkingDurationMinutes: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    transportAvailability: {
      anyOf: [
        { type: 'string', enum: ['car', 'rideshare', 'transit', 'all'] },
        { type: 'null' },
      ],
    },
    parkingPreference: {
      anyOf: [
        { type: 'string', enum: ['none', 'destination', 'nearby'] },
        { type: 'null' },
      ],
    },
    tripType: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    needsParking: { type: 'boolean' },
    needsLeaveTime: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    missingFields: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

function buildSystemPrompt(now = new Date()): string {
  return [
    'You are the PodPaiGo trip intent parser.',
    'Return structured JSON only. Do not recommend routes, parking lots, or call external tools.',
    `Today is ${todayIso(now)}. Resolve relative dates like today, tomorrow, Friday, and Sunday to YYYY-MM-DD.`,
    'Classify airport trips, general point A-to-B trips, and parking-only requests.',
    'Use mode general_trip or quick_go for local destination plans like Pike Place, stores, offices, restaurants, malls, hotels, downtown, or commute requests.',
    'Use mode parking_only for requests that only ask for parking windows, such as parking at SEA from one date/time to another.',
    'Use mode airport_trip for flights, airport pickup/dropoff, and airport travel timing.',
    'For general trips, map transportAvailability to car, rideshare, transit, or all. Map Uber/Lyft/taxi/no parking to rideshare and parkingPreference none.',
    'For parking durations, convert hours to minutes. For "park for 8 hours", return parkingDurationMinutes 480.',
    'If a field is not stated, use null rather than guessing except obvious airport codes and obvious category/kind.',
  ].join('\n');
}

export type OpenAiParseResult = {
  parsed: ParsedTripAssistantResult | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  errorCode?: string | null;
};

function extractResponseText(json: unknown): string | null {
  const value = json as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
  };

  if (typeof value.output_text === 'string' && value.output_text.trim()) {
    return value.output_text;
  }

  const parts: string[] = [];
  for (const output of value.output ?? []) {
    for (const content of output.content ?? []) {
      if (
        (content.type === 'output_text' || content.type === 'text') &&
        typeof content.text === 'string'
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join('').trim() || null;
}

export async function parseTripTextOpenAi(userText: string): Promise<OpenAiParseResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { parsed: null, errorCode: 'missing_api_key' };
  }

  const model = getOpenAiTripParseModel();

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: userText },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'podpaigo_trip_parse',
            strict: true,
            schema: TRIP_PARSE_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      return { parsed: null, errorCode: `openai_http_${response.status}` };
    }

    const json = await response.json();
    const content = extractResponseText(json);
    if (typeof content !== 'string') {
      return { parsed: null, errorCode: 'openai_empty_content' };
    }

    const raw = JSON.parse(content) as unknown;
    const normalized = normalizeParsedTripAssistantResult(raw, 'openai');
    if (!normalized) {
      return { parsed: null, errorCode: 'openai_invalid_schema' };
    }

    const usage = json?.usage ?? {};
    const promptTokens =
      typeof usage.input_tokens === 'number'
        ? usage.input_tokens
        : typeof usage.prompt_tokens === 'number'
          ? usage.prompt_tokens
          : null;
    const completionTokens =
      typeof usage.output_tokens === 'number'
        ? usage.output_tokens
        : typeof usage.completion_tokens === 'number'
          ? usage.completion_tokens
          : null;
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
