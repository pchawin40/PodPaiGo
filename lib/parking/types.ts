export type LiveParkingQuote = {
  provider: string;
  lotName: string;
  price: number;
  priceUnit: 'total' | 'per-day';
  currency: 'USD';
  bookingUrl: string;
  source: 'api';
  lastUpdated: string;
};