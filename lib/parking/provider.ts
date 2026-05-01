import { LiveParkingQuote } from './types';

export type RoutesApiElement = {
  condition?: string;
  status?: { code?: number; message?: string } | string;
  durationMillis?: number;
  duration?: string | { value?: number };
  staticDuration?: string | number;
};

export type RoutesApiResponse = {
  rows?: Array<{ elements?: RoutesApiElement[] }>;
  matrix?: { rows?: Array<{ elements?: RoutesApiElement[] }> };
  error?: { message?: string };
};

export async function getLiveParkingQuotes(args: {
  airportCode: string;
  startTime: string;
  endTime?: string;
}): Promise<LiveParkingQuote[]> {
  // TODO: connect real partner API here.
  return [];
}