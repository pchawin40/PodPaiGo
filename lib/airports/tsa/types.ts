// lib/airports/tsa/types.ts
export type TsaLane = 'standard' | 'precheck' | 'clear' | 'clear-precheck';

export type TsaWaitTimes = {
  standard: number;
  precheck: number;
  clear: number;
  clearPrecheck: number;
};