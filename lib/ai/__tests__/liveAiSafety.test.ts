import fs from 'fs';
import path from 'path';
import {
  checkAiDailyBudget,
  recordAiDailyBudgetUse,
  resetAiDailyBudgetForTests,
} from '../aiDailyBudget';
import { normalizeParsedTripAssistantResult } from '../normalizeParsedTrip';
import { parseTripText } from '../parseTripText';
import { resetAiParseBudgetForTests } from '../tripParseBudget';

describe('normalizeParsedTripAssistantResult', () => {
  test('returns structured schema fields from OpenAI-like payload', () => {
    const parsed = normalizeParsedTripAssistantResult(
      {
        originText: 'Monroe',
        airportCode: 'sea',
        destinationCity: 'Las Vegas',
        airlineText: 'Alaska',
        departureDate: '2026-11-15',
        departureTime: '08:00',
        returnDate: '2026-11-18',
        returnTime: '18:00',
        tripType: 'round-trip',
        needsParking: true,
        needsLeaveTime: true,
        confidence: 'high',
        missingFields: [],
      },
      'openai',
    );

    expect(parsed).toMatchObject({
      originText: 'Monroe',
      airportCode: 'SEA',
      destinationCity: 'Las Vegas',
      airlineText: 'Alaska',
      departureDate: '2026-11-15',
      parser: 'openai',
    });
  });
});

describe('parseTripText safety guards', () => {
  beforeEach(() => {
    resetAiParseBudgetForTests();
    resetAiDailyBudgetForTests();
    delete process.env.DISABLE_AI_ASSISTANT;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_ASSISTANT_PROVIDER = 'mock';
    process.env.MAX_AI_PARSE_CALLS_PER_REQUEST = '1';
    process.env.MAX_AI_PARSE_INPUT_CHARS = '1000';
    process.env.MAX_AI_PARSE_CALLS_PER_ANON_DAY = '5';
  });

  test('live AI disabled falls back safely to mock parser', async () => {
    process.env.DISABLE_AI_ASSISTANT = 'true';
    process.env.AI_ASSISTANT_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';

    const parsed = await parseTripText('SEA to Vegas Nov 15 weekend');
    expect(parsed.parser).toBe('mock');
  });

  test('missing OpenAI key does not crash and falls back to mock', async () => {
    process.env.AI_ASSISTANT_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;

    const parsed = await parseTripText('SEA to Vegas Nov 15 weekend');
    expect(parsed.parser).toBe('mock');
    expect(parsed.airportCode).toBe('SEA');
  });

  test('rejects input over char limit', async () => {
    process.env.MAX_AI_PARSE_INPUT_CHARS = '20';

    const parsed = await parseTripText('This trip description is definitely longer than twenty chars');
    expect(parsed.missingFields).toContain('inputTooLong');
  });

  test('daily limit blocks calls', async () => {
    process.env.MAX_AI_PARSE_CALLS_PER_ANON_DAY = '1';
    recordAiDailyBudgetUse({ sessionId: 'anon-session' });

    const budget = await checkAiDailyBudget({ sessionId: 'anon-session' });
    expect(budget.allowed).toBe(false);

    const parsed = await parseTripText('SEA to Vegas Nov 15 weekend', {
      sessionId: 'anon-session',
    });
    expect(parsed.missingFields).toContain('dailyLimit');
  });

  test('OpenAI parser returns structured schema', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_TRIP_PARSE_MODEL = 'gpt-4o-mini';

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                originText: 'Monroe',
                airportCode: 'SEA',
                destinationCity: 'Las Vegas',
                departureDate: '2026-11-15',
                returnDate: '2026-11-18',
                needsParking: true,
                needsLeaveTime: true,
                confidence: 'high',
                missingFields: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    } as Response);

    const { parseTripTextOpenAi } = await import('../openaiTripParser');
    const result = await parseTripTextOpenAi('Weekend from Monroe to SEA Nov 15-18');

    expect(result.parsed).toMatchObject({
      originText: 'Monroe',
      airportCode: 'SEA',
      destinationCity: 'Las Vegas',
      parser: 'openai',
    });

    fetchMock.mockRestore();
  });
});

describe('pricing page placeholder', () => {
  test('renders free and future pro sections', () => {
    const pagePath = path.join(__dirname, '../../../app/pricing/page.tsx');
    const source = fs.readFileSync(pagePath, 'utf8');

    expect(source).toContain('Free');
    expect(source).toContain('Future Pro');
    expect(source).toContain('Stripe subscriptions are not enabled yet');
  });
});
