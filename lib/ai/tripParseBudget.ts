import { getMaxAiParseCallsPerRequest } from './tripParseConfig';

let activeParseCalls = 0;

export function resetAiParseBudgetForTests(): void {
  activeParseCalls = 0;
}

export function tryConsumeAiParseCall(): boolean {
  const limit = getMaxAiParseCallsPerRequest();
  if (limit === 0) return false;
  if (activeParseCalls >= limit) return false;
  activeParseCalls += 1;
  return true;
}

export function beginAiParseRequest(): void {
  activeParseCalls = 0;
}

export function getActiveAiParseCalls(): number {
  return activeParseCalls;
}
