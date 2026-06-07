export type CityStreetParkingPaymentExpectation =
  | 'likely_free'
  | 'likely_paid'
  | 'check_signs';

export type CityStreetParkingType = 'street' | 'garage' | 'unknown';

export type CityStreetParkingConfidence = 'low' | 'medium' | 'high';

export type CityStreetParkingSpecialSignal =
  | 'sunday_free'
  | 'holiday_free'
  | 'off_hours'
  | 'extended_paid_hours'
  | 'event_zone_possible'
  | 'typical_paid_hours'
  | 'garage_or_lot'
  | 'verify_signs';

export type CityStreetParkingRulesInput = {
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationCity?: string | null;
  destination?: string | null;
  tripDateTime: Date;
  parkingType?: CityStreetParkingType;
};

export type CityStreetParkingRulesResult = {
  paymentExpectation: CityStreetParkingPaymentExpectation;
  reason: string;
  confidence: CityStreetParkingConfidence;
  supplementalText?: string;
  holidayName?: string;
  paidStartHour?: number;
  paidEndHour?: number;
  cityRuleId?: string;
  jurisdictionName?: string;
  sourceLabel?: string;
  specialSignals?: CityStreetParkingSpecialSignal[];
};

export type CityStreetParkingRuleModule = {
  cityRuleId: string;
  jurisdictionName: string;
  sourceLabel: string;
  matches(input: CityStreetParkingRulesInput): boolean;
  evaluate(input: CityStreetParkingRulesInput): CityStreetParkingRulesResult | null;
};

export const CITY_STREET_PARKING_SPECIAL_SIGNAL_LABELS: Record<
  CityStreetParkingSpecialSignal,
  string
> = {
  sunday_free: 'Sunday rule',
  holiday_free: 'Holiday rule',
  off_hours: 'Off-hours',
  extended_paid_hours: 'Extended paid hours',
  event_zone_possible: 'Event zone possible',
  typical_paid_hours: 'Typical paid hours',
  garage_or_lot: 'Garage/lot rules',
  verify_signs: 'Verify signs',
};

export function uniqueStreetParkingSignals(
  signals: Array<CityStreetParkingSpecialSignal | null | undefined>,
): CityStreetParkingSpecialSignal[] {
  return [...new Set(signals.filter((signal): signal is CityStreetParkingSpecialSignal => Boolean(signal)))];
}
