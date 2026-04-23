'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Recommendation, TripData, TrustStatus } from '../../lib/types';
import { RecommendationEngine } from '../../lib/recommendationEngine';
import { RankedRecommendation } from '../../lib/domain';
import { resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';
import { PROVIDER_LINKS } from '../../lib/providerCatalog';

type SortTab = 'easiest' | 'cheapest' | 'fastest';

function formatMoney(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? `$${rounded.toFixed(0)}` : `$${rounded.toFixed(2)}`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTimeFriendly(time24: string): string {
  const m = time24.match(/^([0-2]\d):([0-5]\d)$/);
  if (!m) return time24;
  let hours = Number(m[1]);
  const minutes = m[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${ampm}`;
}

function confidenceFromTrust(trust: TrustStatus): { label: string; className: string } {
  switch (trust) {
    case 'verified-source':
      return { label: 'High confidence', className: 'bg-blue-50 text-blue-800 border-blue-200' };
    case 'live':
      return { label: 'Live', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'estimated':
      return { label: 'Estimated', className: 'bg-amber-50 text-amber-900 border-amber-200' };
    case 'fallback':
    default:
      return { label: 'Low confidence', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  }
}

function typeLabel(type: RankedRecommendation['type']): string {
  if (type === 'rideshare') return 'Ride';
  if (type === 'parking') return 'Parking';
  return 'Transit';
}

function bestLink(option: any): string | null {
  return option.sourceLink || option.mapLink || null;
}

function pricingKindLabel(kind?: string): string {
  switch (kind) {
    case 'live':
      return 'Live';
    case 'estimated':
      return 'Estimated';
    case 'mock':
      return 'Mock data';
    case 'check-live':
      return 'Check live price';
    case 'from-per-day':
      return 'From / day';
    default:
      return '—';
  }
}

function formatProviderPrice(it: any): { primary: string; secondary?: string } {
  const kind = it.priceDisplay as string | undefined;
  const unit = it.priceUnit as string | undefined;

  if (kind === 'check-live') {
    return { primary: 'Check live price', secondary: it.priceNote };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof it.price === 'number') {
    return { primary: `From ${formatMoney(it.price)}/day`, secondary: it.priceNote };
  }

  if ((kind === 'estimated' || kind === 'mock') && typeof it.price === 'number') {
    const prefix = kind === 'mock' ? 'Mock:' : 'Est.';
    return { primary: `${prefix} ${formatMoney(it.price)}`, secondary: it.priceNote };
  }

  if (typeof it.price === 'number') {
    return { primary: formatMoney(it.price), secondary: it.priceNote };
  }

  return { primary: 'Check price', secondary: it.priceNote };
}

function PriceLegend() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
      <div className="font-semibold text-zinc-900">Price legend</div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="font-medium">Live</div>
          <div className="text-xs text-zinc-600">Pulled from provider/API</div>
        </div>
        <div>
          <div className="font-medium">Estimated</div>
          <div className="text-xs text-zinc-600">Calculated or based on typical rates</div>
        </div>
        <div>
          <div className="font-medium">From / day</div>
          <div className="text-xs text-zinc-600">Daily rate; trip total may vary by length of stay</div>
        </div>
        <div>
          <div className="font-medium">Check live price</div>
          <div className="text-xs text-zinc-600">App does not have reliable live pricing yet; open provider to confirm</div>
        </div>
      </div>
    </div>
  );
}

function PricingLinksSection({
  title,
  items,
}: {
  title: string;
  items: Array<any>;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        <p className="mt-1 text-sm text-zinc-600">Pricing + links (best-effort, may vary).</p>
      </div>
      <div className="divide-y divide-zinc-100">
        {items.map((it: any) => {
          const trust = confidenceFromTrust((it.trustStatus || 'estimated') as TrustStatus);
          const price = formatProviderPrice(it);
          const link = bestLink(it);
          const kind = it.priceDisplay as string | undefined;

          return (
            <div key={it.id || it.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900">{it.name}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ' + trust.className}>
                    {trust.label}
                  </div>
                  {kind && (
                    <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                      {pricingKindLabel(kind)}
                    </div>
                  )}
                </div>
                {price.secondary && (
                  <div className="mt-2 text-xs text-zinc-500">{price.secondary}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-zinc-900">{price.primary}</div>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Check
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SortTabs({ value, onChange }: { value: SortTab; onChange: (v: SortTab) => void }) {
  const tabs: Array<{ key: SortTab; label: string; sub: string }> = [
    { key: 'easiest', label: 'Easiest', sub: 'Lowest stress' },
    { key: 'cheapest', label: 'Cheapest', sub: 'Lowest cost' },
    { key: 'fastest', label: 'Fastest', sub: 'Shortest time' },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              'rounded-xl px-3 py-2 text-left transition ' +
              (active ? 'bg-blue-600 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-50')
            }
          >
            <div className="text-sm font-semibold">{t.label}</div>
            <div className={active ? 'text-xs text-blue-100' : 'text-xs text-zinc-500'}>{t.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function optionPriceSummary(option: any, computedTotal: number, tripData: TripData | null): { primary: string; secondary?: string; badge?: string } {
  const kind = option?.priceDisplay as string | undefined;
  const unit = option?.priceUnit as string | undefined;

  if (kind === 'check-live') {
    return {
      primary: 'Check live price',
      secondary: option?.priceNote,
      badge: 'Check live price',
    };
  }

  if (kind === 'from-per-day' && unit === 'per-day' && typeof option?.price === 'number') {
    // If parking duration is available in tripData, compute estimated trip total using ceiling(days).
    if (tripData && 'parkingDuration' in tripData && tripData.parkingDuration) {
      const minutes = tripData.parkingDuration as number;
      const hours = minutes / 60;
      const days = Math.max(1, Math.ceil(hours / 24));
      const tripTotal = option.price * days;
      return {
        primary: `From ${formatMoney(option.price)}/day`,
        secondary: `Est. trip total: ${formatMoney(tripTotal)} for ${days} day(s) · Check final price with provider`,
        badge: 'Estimated',
      };
    }

    return {
      primary: `From ${formatMoney(option.price)}/day`,
      secondary: option?.priceNote,
      badge: 'Estimated',
    };
  }

  if (kind === 'mock') {
    return {
      primary: `Mock estimate: ${formatMoney(computedTotal)}`,
      secondary: option?.priceNote,
      badge: 'Mock data',
    };
  }

  if (kind === 'estimated') {
    return {
      primary: `Est. ${formatMoney(computedTotal)}`,
      secondary: option?.priceNote,
      badge: 'Estimated',
    };
  }

  // Default legacy behavior
  return {
    primary: formatMoney(computedTotal),
    secondary: option?.priceNote,
  };
}

function OptionCard({
  item,
  rank,
  tripData,
}: {
  item: RankedRecommendation;
  rank: number;
  tripData: TripData | null;
}) {
  const opt: any = item.option;
  const trust = confidenceFromTrust((opt.trustStatus || 'estimated') as TrustStatus);

  const sourceLink = opt.sourceLink || null;
  const routeLink = opt.mapLink || null;

  const price = optionPriceSummary(opt, item.cost, tripData);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-zinc-900">{opt.name}</div>
            <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
              {typeLabel(item.type)}
            </div>
            {rank === 1 && (
              <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                Recommended
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold text-zinc-900">{price.primary}</div>
            <div className="text-sm text-zinc-600">• {formatMinutes(item.duration)}</div>
            <div className={"rounded-full border px-2.5 py-1 text-xs font-medium " + trust.className}>
              {trust.label}
            </div>
            {price.badge && (
              <div className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                {price.badge}
              </div>
            )}
          </div>
          {price.secondary && (
            <div className="mt-2 text-xs text-zinc-500">{price.secondary}</div>
          )}

          <div className="mt-4">
            <div className="text-sm font-medium text-zinc-900">Why this option</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {item.reasons.slice(0, 3).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-stretch">
          {sourceLink && (
            <a
              href={sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              View / Book
            </a>
          )}
          {routeLink && (
            <a
              href={routeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Route
            </a>
          )}
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-800">Details & evidence</summary>
        <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
          <div><span className="font-medium">Source:</span> {opt.sourceName}</div>
          {opt.lastUpdated && (
            <div className="mt-1"><span className="font-medium">Updated:</span> {new Date(opt.lastUpdated).toLocaleString()}</div>
          )}
          {Array.isArray(opt.assumptions) && opt.assumptions.length > 0 && (
            <>
              <div className="mt-3 font-medium">Assumptions</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {opt.assumptions.slice(0, 6).map((a: string) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

export default function ResultsContent() {
  const searchParams = useSearchParams();

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [rankedOptions, setRankedOptions] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripData | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<TripData | null>(null);

  const [sort, setSort] = useState<SortTab>('easiest');

  const airlineOrFlight = searchParams.get('airlineOrFlight') || '';
  const intent = searchParams.get('intent') || '';

  const seatacZone = useMemo(() => {
    if (!airlineOrFlight) return null;
    return resolveSeatacCheckinZone(airlineOrFlight);
  }, [airlineOrFlight]);

  useEffect(() => {
    const type = searchParams.get('type') as TripData['type'] | null;
    const origin = searchParams.get('origin') || '';
    const destination = searchParams.get('destination') || '';
    const parkingDurationStr = searchParams.get('parkingDuration');
    const parkingDuration = parkingDurationStr ? parseInt(parkingDurationStr, 10) : undefined;

    let data: TripData | null = null;

    if (type === 'one-way-departure') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      if (departureDate && departureTime && origin && destination) {
        data = { type, origin, destination, departureDate, departureTime, parkingDuration };
      }
    } else if (type === 'one-way-arrival') {
      const arrivalDate = searchParams.get('arrivalDate') || '';
      const arrivalTime = searchParams.get('arrivalTime') || '';
      if (arrivalDate && arrivalTime && origin && destination) {
        data = { type, origin, destination, arrivalDate, arrivalTime };
      }
    } else if (type === 'round-trip') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      const returnDate = searchParams.get('returnDate') || '';
      const returnTime = searchParams.get('returnTime') || '';
      if (departureDate && departureTime && returnDate && returnTime && origin && destination) {
        data = { type, origin, destination, departureDate, departureTime, returnDate, returnTime, parkingDuration };
      }
    } else if (type === 'dropoff-pickup') {
      const airportTripDate = searchParams.get('airportTripDate') || '';
      const airportTripTime = searchParams.get('airportTripTime') || '';
      if (airportTripDate && airportTripTime && origin && destination) {
        data = { type, origin, destination, airportTripDate, airportTripTime };
      }
    }

    if (data) {
      fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
        .then((response) => response.json())
        .then((rec: Recommendation) => {
          setRecommendation(rec);
          setTripData(data);

          const ranked = RecommendationEngine.getRankedRecommendations(
            data,
            rec.parking,
            rec.rideshare,
            rec.transit,
            rec.tsaEstimate
          );
          setRankedOptions(ranked);
        })
        .catch((error) => {
          console.error('Error fetching recommendations:', error);
          setLoading(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const handleRecalculate = async (newTripData: TripData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTripData),
      });

      const rec: Recommendation = await response.json();
      setRecommendation(rec);
      setTripData(newTripData);

      const ranked = RecommendationEngine.getRankedRecommendations(
        newTripData,
        rec.parking,
        rec.rideshare,
        rec.transit,
        rec.tsaEstimate
      );
      setRankedOptions(ranked);

      setIsEditing(false);
      setEditingData(null);

      const params = new URLSearchParams();
      params.set('type', newTripData.type);
      params.set('origin', newTripData.origin);
      params.set('destination', newTripData.destination);

      // Preserve consumer-only context.
      const existingIntent = searchParams.get('intent');
      const existingAirlineOrFlight = searchParams.get('airlineOrFlight');
      if (existingIntent) params.set('intent', existingIntent);
      if (existingAirlineOrFlight) params.set('airlineOrFlight', existingAirlineOrFlight);

      if (newTripData.type === 'one-way-departure') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);
        if (newTripData.parkingDuration) {
          params.set('parkingDuration', newTripData.parkingDuration.toString());
        }
      } else if (newTripData.type === 'one-way-arrival') {
        params.set('arrivalDate', newTripData.arrivalDate);
        params.set('arrivalTime', newTripData.arrivalTime);
      } else if (newTripData.type === 'round-trip') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);
        params.set('returnDate', newTripData.returnDate);
        params.set('returnTime', newTripData.returnTime);
        if (newTripData.parkingDuration) {
          params.set('parkingDuration', newTripData.parkingDuration.toString());
        }
      } else if (newTripData.type === 'dropoff-pickup') {
        params.set('airportTripDate', newTripData.airportTripDate);
        params.set('airportTripTime', newTripData.airportTripTime);
      }

      window.history.replaceState(null, '', `/results?${params.toString()}`);
    } catch (error) {
      console.error('Error recalculating recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditingData(tripData);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingData(null);
  };

  const sortedOptions = useMemo(() => {
    const arr = [...rankedOptions];

    if (sort === 'cheapest') {
      return arr.sort((a, b) => (a.cost - b.cost) || (a.duration - b.duration));
    }

    if (sort === 'fastest') {
      return arr.sort((a, b) => (a.duration - b.duration) || (a.cost - b.cost));
    }

    // easiest
    return arr.sort((a, b) => (b.stressScore - a.stressScore) || (a.cost - b.cost));
  }, [rankedOptions, sort]);

  const extraParkingProviders = useMemo(
    () => [
      {
        id: 'seatac-official',
        name: PROVIDER_LINKS.seatacOfficialParking.label,
        trustStatus: 'verified-source' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Rates vary by length of stay and availability',
        sourceName: PROVIDER_LINKS.seatacOfficialParking.sourceName,
        sourceLink: PROVIDER_LINKS.seatacOfficialParking.url,
      },
      {
        id: 'airport-parking-res',
        name: PROVIDER_LINKS.airportParkingReservationsSea.label,
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Search nearby lots and compare',
        sourceName: PROVIDER_LINKS.airportParkingReservationsSea.sourceName,
        sourceLink: PROVIDER_LINKS.airportParkingReservationsSea.url,
      },
    ],
    []
  );

  const extraRideProviders = useMemo(
    () => [
      {
        id: 'uber-link',
        name: PROVIDER_LINKS.uberDeepLink.label,
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Prices vary widely by time and demand',
        sourceName: PROVIDER_LINKS.uberDeepLink.sourceName,
        sourceLink: PROVIDER_LINKS.uberDeepLink.url,
      },
      {
        id: 'lyft-link',
        name: PROVIDER_LINKS.lyftDeepLink.label,
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Prices vary widely by time and demand',
        sourceName: PROVIDER_LINKS.lyftDeepLink.sourceName,
        sourceLink: PROVIDER_LINKS.lyftDeepLink.url,
      },
    ],
    []
  );

  const extraTransitProviders = useMemo(
    () => [
      {
        id: 'soundtransit-planner',
        name: PROVIDER_LINKS.soundTransitPlanner.label,
        trustStatus: 'verified-source' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Use the planner for schedules and up-to-date alerts',
        sourceName: PROVIDER_LINKS.soundTransitPlanner.sourceName,
        sourceLink: PROVIDER_LINKS.soundTransitPlanner.url,
      },
      {
        id: 'google-maps-transit',
        name: 'Google Maps (transit directions)',
        trustStatus: 'estimated' as const,
        priceDisplay: 'check-live' as const,
        priceNote: 'Search routes and real-time service advisories',
        sourceName: PROVIDER_LINKS.googleMaps.sourceName,
        sourceLink: PROVIDER_LINKS.googleMaps.url,
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
        <div className="text-lg text-zinc-700">Loading options…</div>
      </div>
    );
  }

  if (!tripData || !recommendation) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 px-4">
        <div className="text-lg font-medium text-zinc-900">We couldn’t read your trip.</div>
        <div className="mt-1 text-sm text-zinc-600">Go back and try again.</div>
        <Link href="/trip" className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700">
          Plan a trip
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-500">SeaTac</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
                {recommendation.leaveByTime
                  ? `You should leave at ${formatTimeFriendly(recommendation.leaveByTime)}`
                  : 'Your best options'}
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                {seatacZone?.note ? seatacZone.note : 'SeaTac Airport'}
                {intent ? ` • ${intent.replace(/-/g, ' ')}` : ''}
                {airlineOrFlight ? ` • ${airlineOrFlight}` : ''}
                {(tripData.type === 'one-way-departure' || tripData.type === 'round-trip')
                  ? ` • TSA ${recommendation.tsaEstimate.waitTime}m`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                Edit trip
              </button>
              <Link
                href="/trip"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                New trip
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 p-4">
              <div className="text-xs font-medium text-zinc-500">Origin</div>
              <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{tripData.origin}</div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-4">
              <div className="text-xs font-medium text-zinc-500">Destination</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">SeaTac Airport</div>
              <div className="mt-1 text-xs text-zinc-600">{tripData.destination}</div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-4">
              <div className="text-xs font-medium text-zinc-500">Traffic estimate</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {recommendation.trafficEstimate ? `${recommendation.trafficEstimate.duration} min` : '—'}
              </div>
              <div className="mt-1 text-xs text-zinc-600">
                {recommendation.trafficEstimate
                  ? `${recommendation.trafficEstimate.congestion} congestion`
                  : 'No traffic estimate'}
              </div>
            </div>
          </div>
        </div>

        {/* Price legend */}
        <div className="mt-6">
          <PriceLegend />
        </div>

        {/* Edit panel */}
        {isEditing && editingData && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Edit trip details</h2>
                <p className="mt-1 text-sm text-zinc-600">Adjust your timing or origin. We’ll recalculate instantly.</p>
              </div>
              <button
                type="button"
                onClick={cancelEditing}
                className="text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                Close
              </button>
            </div>

            <div className="mt-5">
              <EditTripForm initialData={editingData} onSubmit={handleRecalculate} onCancel={cancelEditing} />
            </div>
          </div>
        )}

        {/* Sort */}
        <div className="mt-6">
          <SortTabs value={sort} onChange={setSort} />
        </div>

        {/* Options */}
        <div className="mt-4 grid grid-cols-1 gap-4">
          {sortedOptions.map((opt, idx) => (
            <OptionCard key={`${opt.type}-${(opt.option as any).id || idx}`} item={opt} rank={idx + 1} tripData={tripData} />
          ))}
        </div>

        {/* Pricing links */}
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PricingLinksSection
            title="Parking providers"
            items={[...(recommendation.parking as any), ...extraParkingProviders]}
          />
          <PricingLinksSection
            title="Ride providers"
            items={[...(recommendation.rideshare as any), ...extraRideProviders]}
          />
          <div className="lg:col-span-2">
            <PricingLinksSection
              title="Transit options"
              items={[...(recommendation.transit as any), ...extraTransitProviders]}
            />
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/trip"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            Plan another trip
          </Link>
        </div>
      </main>
    </div>
  );
}

function EditTripForm({
  initialData,
  onSubmit,
  onCancel,
}: {
  initialData: TripData;
  onSubmit: (data: TripData) => void;
  onCancel: () => void;
}) {
  const [origin, setOrigin] = useState(initialData.origin);
  const [parkingDurationHours, setParkingDurationHours] = useState(
    'parkingDuration' in initialData && initialData.parkingDuration
      ? String(Math.round((initialData.parkingDuration / 60) * 10) / 10)
      : ''
  );

  const [departureDate, setDepartureDate] = useState(
    'departureDate' in initialData ? initialData.departureDate : ''
  );
  const [departureTime, setDepartureTime] = useState(
    'departureTime' in initialData ? initialData.departureTime : ''
  );

  const [airportTripDate, setAirportTripDate] = useState(
    'airportTripDate' in initialData ? initialData.airportTripDate : ''
  );
  const [airportTripTime, setAirportTripTime] = useState(
    'airportTripTime' in initialData ? initialData.airportTripTime : ''
  );

  const [arrivalDate, setArrivalDate] = useState(
    'arrivalDate' in initialData ? initialData.arrivalDate : ''
  );
  const [arrivalTime, setArrivalTime] = useState(
    'arrivalTime' in initialData ? initialData.arrivalTime : ''
  );

  const [returnDate, setReturnDate] = useState(
    'returnDate' in initialData ? initialData.returnDate : ''
  );
  const [returnTime, setReturnTime] = useState(
    'returnTime' in initialData ? initialData.returnTime : ''
  );

  const [errors, setErrors] = useState<string[]>([]);

  const validate = (): string[] => {
    const next: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!origin.trim()) next.push('Origin is required.');

    const checkDateNotPast = (dateString: string, label: string) => {
      if (!dateString) {
        next.push(`${label} is required.`);
        return;
      }
      const d = new Date(dateString);
      if (d < today) next.push(`${label} cannot be in the past.`);
    };

    if (initialData.type === 'one-way-departure') {
      checkDateNotPast(departureDate, 'Date');
      if (!departureTime) next.push('Time is required.');
    }

    if (initialData.type === 'dropoff-pickup') {
      checkDateNotPast(airportTripDate, 'Date');
      if (!airportTripTime) next.push('Time is required.');
    }

    if (initialData.type === 'one-way-arrival') {
      checkDateNotPast(arrivalDate, 'Date');
      if (!arrivalTime) next.push('Time is required.');
    }

    if (initialData.type === 'round-trip') {
      checkDateNotPast(departureDate, 'Departure date');
      if (!departureTime) next.push('Departure time is required.');
      checkDateNotPast(returnDate, 'Return date');
      if (!returnTime) next.push('Return time is required.');

      if (departureDate && returnDate) {
        const dep = new Date(departureDate);
        const ret = new Date(returnDate);
        if (ret < dep) next.push('Return date must be after departure date.');
      }
    }

    if (parkingDurationHours) {
      const hours = Number(parkingDurationHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        next.push('Parking duration must be a positive number of hours.');
      }
    }

    return next;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.length > 0) return;

    const parkingDuration = parkingDurationHours ? Math.round(Number(parkingDurationHours) * 60) : undefined;

    let data: TripData;

    if (initialData.type === 'one-way-departure') {
      data = {
        type: initialData.type,
        origin,
        destination: initialData.destination,
        departureDate,
        departureTime,
        parkingDuration,
      };
    } else if (initialData.type === 'dropoff-pickup') {
      data = {
        type: initialData.type,
        origin,
        destination: initialData.destination,
        airportTripDate,
        airportTripTime,
      };
    } else if (initialData.type === 'one-way-arrival') {
      data = {
        type: initialData.type,
        origin,
        destination: initialData.destination,
        arrivalDate,
        arrivalTime,
      };
    } else {
      data = {
        type: initialData.type,
        origin,
        destination: initialData.destination,
        departureDate,
        departureTime,
        returnDate,
        returnTime,
        parkingDuration,
      };
    }

    onSubmit(data);
  };

  const isDeparture = initialData.type === 'one-way-departure';
  const isDropoffPickup = initialData.type === 'dropoff-pickup';
  const isArrival = initialData.type === 'one-way-arrival';
  const isRoundTrip = initialData.type === 'round-trip';

  return (
    <form onSubmit={submit} className="space-y-4">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-sm font-medium text-red-900">Please fix:</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-800">Origin</label>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {isDeparture && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {isDropoffPickup && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={airportTripDate}
                onChange={(e) => setAirportTripDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={airportTripTime}
                onChange={(e) => setAirportTripTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {isArrival && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Date</label>
              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Time</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {isRoundTrip && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Departure date</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Departure time</label>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Return date</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-800">Return time</label>
              <input
                type="time"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </>
        )}

        {(isDeparture || isRoundTrip) && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-800">
              Parking duration (hours)
              <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
            </label>
            <input
              type="number"
              value={parkingDurationHours}
              onChange={(e) => setParkingDurationHours(e.target.value)}
              min="0.5"
              step="0.5"
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Recalculate
        </button>
      </div>
    </form>
  );
}