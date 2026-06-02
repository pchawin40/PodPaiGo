export function isAiAssistantDisabled(): boolean {
  return process.env.DISABLE_AI_ASSISTANT === 'true';
}

export function getOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

export function getOpenAiTripParseModel(): string {
  return process.env.OPENAI_TRIP_PARSE_MODEL?.trim() || 'gpt-4o-mini';
}

export function getAiAssistantProvider(): 'openai' | 'mock' {
  if (isAiAssistantDisabled()) {
    return 'mock';
  }

  const configured = process.env.AI_ASSISTANT_PROVIDER?.trim().toLowerCase();
  const hasOpenAiKey = Boolean(getOpenAiApiKey());

  if (configured === 'mock') return 'mock';
  if (configured === 'openai') {
    return hasOpenAiKey ? 'openai' : 'mock';
  }

  if (process.env.NODE_ENV === 'production' && hasOpenAiKey) {
    return 'openai';
  }

  return 'mock';
}

export function getMaxAiParseCallsPerRequest(): number {
  const raw = process.env.MAX_AI_PARSE_CALLS_PER_REQUEST;
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  return 1;
}

export function getMaxAiParseInputChars(): number {
  const raw = process.env.MAX_AI_PARSE_INPUT_CHARS;
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1000;
  }

  return 1000;
}

export function getMaxAiParseCallsPerUserDay(): number {
  const raw = process.env.MAX_AI_PARSE_CALLS_PER_USER_DAY;
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 20;
  }

  return 20;
}

export function getMaxAiParseCallsPerAnonDay(): number {
  const raw = process.env.MAX_AI_PARSE_CALLS_PER_ANON_DAY;
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 5;
  }

  return 5;
}

export function isLiveAiAssistantActive(): boolean {
  return !isAiAssistantDisabled() && getAiAssistantProvider() === 'openai';
}
