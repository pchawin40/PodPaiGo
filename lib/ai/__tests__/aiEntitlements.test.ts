import {
  clientRequestedLiveAi,
  getAiAssistantLabel,
  resolveAiMode,
  resolveAiProviderForRequest,
} from '../aiEntitlements';
import { resolveUserPlan } from '../../auth/userPlan';

describe('aiEntitlements', () => {
  beforeEach(() => {
    delete process.env.DISABLE_AI_ASSISTANT;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ADMIN_USER_IDS;
  });

  test('anonymous plan uses mock only', () => {
    expect(resolveUserPlan({ userId: null })).toBe('anonymous');
    expect(resolveAiMode('anonymous')).toBe('mock');
    expect(resolveAiProviderForRequest('anonymous')).toBe('mock');
    expect(getAiAssistantLabel('mock')).toBe('Basic assistant');
  });

  test('signed-in free plan uses mock only', () => {
    expect(resolveUserPlan({ userId: 'user-free-1' })).toBe('free');
    expect(resolveAiMode('free')).toBe('mock');
    expect(getAiAssistantLabel('mock')).toBe('Basic assistant');
  });

  test('paid entitlement allows live only when env and API key exist', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ADMIN_USER_IDS = 'admin-user-1';

    expect(resolveUserPlan({ userId: 'admin-user-1' })).toBe('admin');
    expect(resolveAiMode('admin')).toBe('live');
    expect(resolveAiProviderForRequest('admin')).toBe('openai');
    expect(getAiAssistantLabel('live')).toBe('AI assistant');
  });

  test('missing OpenAI key falls back to mock for paid plans', () => {
    process.env.ADMIN_USER_IDS = 'admin-user-1';
    delete process.env.OPENAI_API_KEY;

    expect(resolveAiMode('admin')).toBe('mock');
  });

  test('DISABLE_AI_ASSISTANT disables all live AI', () => {
    process.env.DISABLE_AI_ASSISTANT = 'true';
    process.env.OPENAI_API_KEY = 'test-key';

    expect(resolveAiMode('admin')).toBe('mock');
  });

  test('client cannot force live AI via request body flags', () => {
    expect(clientRequestedLiveAi({ forceLive: true })).toBe(true);
    expect(clientRequestedLiveAi({ provider: 'openai' })).toBe(true);
    expect(clientRequestedLiveAi({ aiMode: 'live' })).toBe(true);
    expect(clientRequestedLiveAi({ userText: 'hello' })).toBe(false);
  });
});
