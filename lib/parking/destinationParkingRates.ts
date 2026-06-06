import type { ParkingRateResolution, ParkingRateRule } from '../types';
import { buildLocalDateTime } from '../tripTime';

type ResolveDestinationParkingRateInput = {
  rateRules?: ParkingRateRule[];
  fallbackPrice?: number | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  durationMinutes: number;
  eventLikely?: boolean;
  holiday?: boolean;
};

const US_FIXED_HOLIDAYS = new Set(['01-01', '07-04', '11-11', '12-25']);

function parseTimeToMinutes(time: string | null | undefined): number | null {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function isTimeWithinWindow(value: number, start: number, end: number): boolean {
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end;
}

function formatMoney(value: number): string {
  return `$${Math.round(value)}`;
}

function dateKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isLikelyUsHoliday(date: Date): boolean {
  if (US_FIXED_HOLIDAYS.has(dateKey(date))) return true;

  const month = date.getMonth();
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  // Memorial Day: last Monday in May.
  if (month === 4 && dayOfWeek === 1 && day >= 25) return true;

  // Labor Day: first Monday in September.
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;

  // Thanksgiving: fourth Thursday in November.
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  return false;
}

function buildArrivalDate(args: ResolveDestinationParkingRateInput): Date | null {
  if (!args.arrivalDate || !args.arrivalTime) return null;
  return buildLocalDateTime(args.arrivalDate, args.arrivalTime);
}

function ruleDayApplies(rule: ParkingRateRule, arrival: Date | null): boolean {
  if (!rule.appliesOnDays?.length || !arrival) return true;
  return rule.appliesOnDays.includes(arrival.getDay());
}

function exitBeforeOrAt(args: {
  arrival: Date | null;
  durationMinutes: number;
  exitBy: string;
}): boolean {
  const { arrival, durationMinutes, exitBy } = args;
  const exitByMinutes = parseTimeToMinutes(exitBy);
  if (!arrival || exitByMinutes == null) return false;

  const exit = new Date(arrival.getTime() + durationMinutes * 60_000);
  const arrivalMinutes = arrival.getHours() * 60 + arrival.getMinutes();
  const exitMinutes = exit.getHours() * 60 + exit.getMinutes();
  const exitByDate = new Date(arrival);
  exitByDate.setHours(Math.floor(exitByMinutes / 60), exitByMinutes % 60, 0, 0);

  if (exitByMinutes < arrivalMinutes) {
    exitByDate.setDate(exitByDate.getDate() + 1);
  }

  // Same-day exit by a later clock time.
  if (exit.toDateString() === arrival.toDateString()) return exitMinutes <= exitByMinutes;

  return exit.getTime() <= exitByDate.getTime();
}

function timeRuleApplies(rule: ParkingRateRule, args: ResolveDestinationParkingRateInput): boolean {
  const arrival = buildArrivalDate(args);
  const arrivalMinutes = parseTimeToMinutes(args.arrivalTime);

  if (!ruleDayApplies(rule, arrival)) return false;

  if (
    typeof rule.minDurationMinutes === 'number' &&
    args.durationMinutes < rule.minDurationMinutes
  ) {
    return false;
  }

  if (
    typeof rule.maxDurationMinutes === 'number' &&
    args.durationMinutes > rule.maxDurationMinutes
  ) {
    return false;
  }

  if (rule.entryWindow) {
    const start = parseTimeToMinutes(rule.entryWindow.start);
    const end = parseTimeToMinutes(rule.entryWindow.end);
    if (arrivalMinutes == null || start == null || end == null) return false;
    if (!isTimeWithinWindow(arrivalMinutes, start, end)) return false;
  }

  if (rule.startTime) {
    const start = parseTimeToMinutes(rule.startTime);
    if (arrivalMinutes == null || start == null) return false;
    if (arrivalMinutes < start) return false;
  }

  if (rule.exitBy && !exitBeforeOrAt({
    arrival,
    durationMinutes: args.durationMinutes,
    exitBy: rule.exitBy,
  })) {
    return false;
  }

  return true;
}

function eventOrHolidayApplies(
  rule: ParkingRateRule,
  args: ResolveDestinationParkingRateInput,
  arrival: Date | null,
): boolean {
  if (rule.kind === 'event') return args.eventLikely === true;
  if (rule.kind === 'holiday') return args.holiday === true || Boolean(arrival && isLikelyUsHoliday(arrival));
  return true;
}

function totalForRule(
  rule: ParkingRateRule,
  durationMinutes: number,
): number {
  const hours = Math.max(1, Math.ceil(durationMinutes / 60));
  const days = Math.max(1, Math.ceil(durationMinutes / (24 * 60)));

  if (rule.kind === 'hourly' || rule.hourlyRate) {
    const hourly = rule.hourlyRate ?? rule.amount;
    const uncapped = hourly * hours;
    return typeof rule.dailyMax === 'number' ? Math.min(uncapped, rule.dailyMax * days) : uncapped;
  }

  if (rule.kind === 'daily_max' || rule.kind === 'overnight') {
    return rule.amount * days;
  }

  return rule.amount;
}

function resolutionFromRule(
  rule: ParkingRateRule,
  total: number,
  warnings: string[],
): ParkingRateResolution {
  return {
    total,
    label: `${rule.label}: ${formatMoney(total)}`,
    rateType: rule.kind,
    confidence: rule.confidence,
    sourceName: rule.sourceName,
    sourceUrl: rule.sourceUrl,
    ruleId: rule.id,
    warnings,
  };
}

export function resolveDestinationParkingRate(
  args: ResolveDestinationParkingRateInput,
): ParkingRateResolution {
  const rules = args.rateRules ?? [];
  const arrival = buildArrivalDate(args);
  const warnings = new Set<string>();

  if (rules.some((rule) => rule.kind === 'event') && !args.eventLikely) {
    warnings.add('Event rates may override normal pricing.');
  }

  const earlyBirdRules = rules.filter((rule) => rule.kind === 'early_bird');
  if (
    earlyBirdRules.length > 0 &&
    !earlyBirdRules.some((rule) => timeRuleApplies(rule, args))
  ) {
    const first = earlyBirdRules[0]!;
    warnings.add(
      first.exitBy
        ? `Early bird rate may apply only with qualifying entry and exit by ${first.exitBy}.`
        : 'Early bird rate may apply only during the posted entry window.',
    );
  }

  if (rules.some((rule) => rule.kind === 'weekend') && arrival && arrival.getDay() !== 0 && arrival.getDay() !== 6) {
    warnings.add('Weekend rate may apply on Saturday or Sunday.');
  }

  const applicable = rules
    .filter((rule) => eventOrHolidayApplies(rule, args, arrival))
    .filter((rule) => timeRuleApplies(rule, args))
    .map((rule) => ({
      rule,
      total: totalForRule(rule, args.durationMinutes),
      priority:
        rule.priority ??
        (rule.kind === 'event'
          ? 100
          : rule.kind === 'holiday'
            ? 80
            : rule.kind === 'early_bird' || rule.kind === 'evening'
              ? 60
              : rule.kind === 'weekend'
                ? 50
                : 10),
    }))
    .filter((item) => Number.isFinite(item.total) && item.total >= 0)
    .sort((a, b) => b.priority - a.priority || a.total - b.total);

  const selected = applicable[0];
  if (selected) {
    if (selected.rule.kind === 'early_bird') {
      warnings.add('Early bird pricing usually requires matching both entry and exit rules.');
    }
    if (selected.rule.kind === 'event') {
      warnings.add('Event pricing may replace normal garage rates.');
    }
    if (selected.rule.kind === 'street_meter') {
      warnings.add('Confirm street signs, time limits, and payment hours before parking.');
    }

    return resolutionFromRule(selected.rule, selected.total, Array.from(warnings));
  }

  const fallback =
    typeof args.fallbackPrice === 'number' && Number.isFinite(args.fallbackPrice)
      ? args.fallbackPrice
      : null;

  return {
    total: fallback,
    label: fallback == null ? 'Estimated parking rate' : `Estimated: ${formatMoney(fallback)}`,
    rateType: 'fallback',
    confidence: 'low',
    warnings: [
      ...Array.from(warnings),
      'Check posted garage rules before parking.',
      'Special rate may apply.',
    ],
  };
}

export function applyResolvedDestinationParkingRate<T extends { price: number; assumptions?: string[]; rateRules?: ParkingRateRule[]; activeRate?: ParkingRateResolution; priceNote?: string; priceConfidence?: 'high' | 'medium' | 'low'; priceDisplay?: string; priceUnit?: string; priceSource?: string; pricingConfidence?: string; trustStatus?: string }>(
  option: T,
  args: Omit<ResolveDestinationParkingRateInput, 'rateRules' | 'fallbackPrice'>,
): T {
  if (!option.rateRules?.length) return option;

  const activeRate = resolveDestinationParkingRate({
    ...args,
    rateRules: option.rateRules,
    fallbackPrice: option.price,
  });

  if (activeRate.total == null) {
    return {
      ...option,
      activeRate,
      assumptions: [...(option.assumptions || []), ...activeRate.warnings],
    };
  }

  return {
    ...option,
    price: activeRate.total,
    priceMin: activeRate.total,
    priceMax: activeRate.total,
    priceDisplay: 'estimated',
    priceUnit: 'total',
    priceSource: option.priceSource || 'official-rate',
    pricingConfidence:
      activeRate.confidence === 'high' ? 'official' : option.pricingConfidence || 'estimated',
    trustStatus:
      activeRate.confidence === 'high' ? 'verified-source' : option.trustStatus || 'estimated',
    priceConfidence: activeRate.confidence,
    activeRate,
    priceNote: `${activeRate.label}. ${option.priceNote || 'Confirm posted garage rules before parking.'}`,
    assumptions: [...(option.assumptions || []), ...activeRate.warnings],
  } as T;
}
