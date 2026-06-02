export function isAiAssistantDisabled(): boolean {
  return process.env.DISABLE_AI_ASSISTANT === 'true';
}

export function getAiAssistantProvider(): 'openai' | 'mock' {
  if (isAiAssistantDisabled()) {
    return 'mock';
  }

  const configured = process.env.AI_ASSISTANT_PROVIDER?.trim().toLowerCase();
  if (configured === 'openai') return 'openai';
  if (configured === 'mock') return 'mock';

  return process.env.NODE_ENV === 'development' ? 'mock' : 'mock';
}

export function getMaxAiParseCallsPerRequest(): number {
  const raw = process.env.MAX_AI_PARSE_CALLS_PER_REQUEST;
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  return 1;
}

export function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}
