import { LiveParkingQuote } from './types';

export async function getLiveParkingQuotes(args: {
  airportCode: string;
  startTime: string;
  endTime?: string;
}): Promise<LiveParkingQuote[]> {
  // TODO: connect real partner API here.
  return [];
}