// lib/airports/tsa/estimates.ts
import { TsaWaitTimes } from './types';

export const TSA_ESTIMATES: Record<string, TsaWaitTimes> = {
  SEA: { standard: 20, precheck: 8, clear: 12, clearPrecheck: 5 },
  JFK: { standard: 30, precheck: 12, clear: 16, clearPrecheck: 8 },
  LAX: { standard: 28, precheck: 12, clear: 15, clearPrecheck: 8 },
  ORD: { standard: 25, precheck: 10, clear: 14, clearPrecheck: 7 },
  ATL: { standard: 30, precheck: 12, clear: 16, clearPrecheck: 8 },
};

export const DEFAULT_TSA_ESTIMATE: TsaWaitTimes = {
  standard: 25,
  precheck: 10,
  clear: 14,
  clearPrecheck: 7,
};