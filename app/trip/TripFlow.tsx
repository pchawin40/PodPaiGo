'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressInput } from './AddressInput';
import { CabinClass, FlightType, SecurityOption, TransportAvailability, TripType } from '../../lib/types';
import { getSeatacRideshareDropoffNote, resolveSeatacCheckinZone } from '../../lib/airports/seatacCheckin';

type Intent = 'flying-out' | 'picking-up' | 'dropping-off' | 'parking-trip';

type Step = 1 | 2;

type FormState = {
  intent: Intent | null;
  transportAvailability: TransportAvailability;
  airlineOrFlight: string;
  origin: string;
  date: string;
  time: string;
  parkingDurationHours: string;
  checkingBags: boolean;
  securityOption: SecurityOption;
  flightType: FlightType;
  cabin: CabinClass;
};

function intentToTripType(intent: Intent): TripType {
  switch (intent) {
    case 'flying-out':
      return 'one-way-departure';
    case 'parking-trip':
      return 'one-way-departure';
    case 'picking-up':
      return 'dropoff-pickup';
    case 'dropping-off':
      return 'dropoff-pickup';
  }
}

function intentCopy(intent: Intent) {
  switch (intent) {
    case 'flying-out':
      return {
        title: 'Flying out',
        timeLabel: 'When does your flight leave?',
        helper: 'Use your scheduled airline departure time.',
        wantsAirline: true,
        wantsParkingDuration: true,
      };
    case 'picking-up':
      return {
        title: 'Picking someone up',
        timeLabel: "When does their flight arrive?",
        helper: 'Use their scheduled arrival time. We’ll estimate when you should leave.',
        wantsAirline: false,
        wantsParkingDuration: false,
      };
    case 'dropping-off':
      return {
        title: 'Dropping someone off',
        timeLabel: 'When do they need to arrive at SeaTac?',
        helper: "Use the time they need to be at the airport; we'll estimate when you should leave.",
        wantsAirline: false,
        wantsParkingDuration: false,
      };
    case 'parking-trip':
      return {
        title: 'Parking trip',
        timeLabel: 'When do you want to arrive at SeaTac?',
        helper: 'We’ll compare official garage vs nearby lots and rides.',
        wantsAirline: false,
        wantsParkingDuration: true,
      };
  }
}

function Card({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        `group w-full rounded-2xl border p-5 text-left shadow-sm transition ` +
        (selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50')
      }
    >
      <div className="text-base font-semibold text-zinc-900">{title}</div>
      <div className="mt-1 text-sm text-zinc-600">{subtitle}</div>
      <div className={
        `mt-4 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ` +
        (selected ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200')
      }>
        {selected ? 'Selected' : 'Choose'}
      </div>
    </button>
  );
}

export default function TripFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<string[]>([]);

  // track if user manually interacted with time input
  const [timeTouched, setTimeTouched] = useState(false);

  const [state, setState] = useState<FormState>({
    intent: null,
    transportAvailability: 'all',
    airlineOrFlight: '',
    origin: '',
    date: '',
    time: '',
    parkingDurationHours: '',
    checkingBags: false,
    securityOption: 'standard',
    flightType: 'domestic',
    cabin: 'economy',
  });

  const intent = state.intent;

  const seatacZone = useMemo(() => {
    if (!intent) return null;
    const wantsAirline = intentCopy(intent).wantsAirline;
    if (!wantsAirline || !state.airlineOrFlight.trim()) {
      return {
        destination: 'Central Terminal' as const,
        note: 'SeaTac main terminal check-in',
      };
    }

    return resolveSeatacCheckinZone(state.airlineOrFlight);
  }, [intent, state.airlineOrFlight]);

  const validate = (forStep: Step): string[] => {
    const next: string[] = [];

    // Step 1 only chooses intent.
    if (forStep === 1) {
      if (!state.intent) next.push('Please choose what you’re doing today.');
      return next;
    }

    // Step 2 validates the full form.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!state.intent) next.push('Please choose what you’re doing today.');
    if (!state.origin.trim()) next.push('Origin is required.');

    // Date and time required
    if (!state.date) {
      next.push('Date is required.');
    }

    if (!state.time) {
      next.push('Time is required.');
    }

    // If both present, validate combined datetime against now
    if (state.date && state.time) {
      const combined = new Date(`${state.date}T${state.time}`);
      const now = new Date();
      if (isNaN(combined.getTime())) {
        next.push('Invalid date or time');
      } else if (combined.getTime() < now.getTime()) {
        next.push('Trip time cannot be in the past.');
      }
    }

    // Airline/flight is helpful but optional for flying-out; do not block submission if blank
    if (intent && intentCopy(intent).wantsAirline && intent !== 'flying-out') {
      if (!state.airlineOrFlight.trim()) {
        next.push('Airline or flight number is required.');
      }
    }

    if (intent && intentCopy(intent).wantsParkingDuration) {
      if (state.parkingDurationHours) {
        const hours = Number(state.parkingDurationHours);
        if (!Number.isFinite(hours) || hours <= 0) {
          next.push('Parking duration must be a positive number of hours.');
        }
      }
    }

    return next;
  };

  const onContinue = () => {
    const next = validate(1);
    setErrors(next);
    if (next.length > 0) return;

    // Friendly defaults when entering step 2.
    setState((s) => {
      const now = new Date();
      const yyyyMmDd = now.toISOString().slice(0, 10);

      // If date already set keep it; otherwise default to today for all intents
      let nextDate = s.date || yyyyMmDd;

      // Default time behavior depends on intent
      let nextTime = s.time; // preserve if already provided

      if (!nextTime) {
        if (state.intent === 'flying-out') {
          // keep time blank for flying out to avoid confusion
          nextTime = '';
        } else if (state.intent === 'picking-up' || state.intent === 'parking-trip') {
          // now + 60 minutes
          const d = new Date();
          d.setMinutes(d.getMinutes() + 60);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          nextTime = `${hh}:${mm}`;
        } else if (state.intent === 'dropping-off') {
          // now + 90 minutes
          const d = new Date();
          d.setMinutes(d.getMinutes() + 90);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          nextTime = `${hh}:${mm}`;
        }
      }

      return {
        ...s,
        date: nextDate,
        time: nextTime,
      };
    });

    // Do not mark timeTouched when we programmatically set defaults
    setStep(2);
  };

  const onBack = () => {
    setErrors([]);
    setStep(1);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const next = validate(2);
    setErrors(next);
    if (next.length > 0) return;

    const tripType = intentToTripType(state.intent!);
    const destination = seatacZone?.destination || 'Central Terminal';

    const params = new URLSearchParams();
    params.set('type', tripType);
    params.set('origin', state.origin);
    params.set('destination', destination);
    params.set('intent', state.intent!);
    params.set('transport', state.transportAvailability);

    if (state.airlineOrFlight.trim()) {
      params.set('airlineOrFlight', state.airlineOrFlight.trim());
    }

    if (tripType === 'one-way-departure') {
      params.set('departureDate', state.date);
      params.set('departureTime', state.time);

      // Flying-out only: airport readiness assumptions
      if (state.intent === 'flying-out') {
        params.set('bags', state.checkingBags ? 'yes' : 'no');
        params.set('security', state.securityOption);
        params.set('flightType', state.flightType);
        params.set('cabin', state.cabin);
      }

      if (state.parkingDurationHours) {
        const minutes = Math.round(Number(state.parkingDurationHours) * 60);
        if (Number.isFinite(minutes) && minutes > 0) {
          params.set('parkingDuration', String(minutes));
        }
      }
    } else {
      // dropoff-pickup
      params.set('airportTripDate', state.date);
      params.set('airportTripTime', state.time);
    }

    router.push(`/results?${params.toString()}`);
  };

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Plan a calmer SeaTac trip
          </h1>
          <p className="mt-2 text-zinc-600">
            Tell us what you’re doing — we’ll compare parking, rides, and transit and give you a clear “leave by” time.
          </p>
        </div>

        {errors.length > 0 && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="text-sm font-medium text-red-900">Please fix:</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">What are you doing today?</h2>
              <p className="mt-1 text-sm text-zinc-600">Choose one to get the right defaults.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card
                title="Flying out"
                subtitle="Get a leave-by time + best way to the airport"
                selected={state.intent === 'flying-out'}
                onClick={() => setState((s) => ({ ...s, intent: 'flying-out' }))}
              />
              <Card
                title="Picking someone up"
                subtitle="Plan your drive or rideshare to arrivals"
                selected={state.intent === 'picking-up'}
                onClick={() => setState((s) => ({ ...s, intent: 'picking-up' }))}
              />
              <Card
                title="Dropping someone off"
                subtitle="Get timing + drop-off guidance"
                selected={state.intent === 'dropping-off'}
                onClick={() => setState((s) => ({ ...s, intent: 'dropping-off' }))}
              />
              <Card
                title="Parking trip"
                subtitle="Compare garage vs shuttle lots + pricing links"
                selected={state.intent === 'parking-trip'}
                onClick={() => setState((s) => ({ ...s, intent: 'parking-trip' }))}
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 sm:w-auto"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && intent && (
          <form onSubmit={onSubmit} className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-zinc-500">Step 2</div>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-900">
                    {intentCopy(intent).title}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">{intentCopy(intent).helper}</p>
                </div>
                <button
                  type="button"
                  onClick={onBack}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800"
                >
                  Change
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="text-sm font-medium text-zinc-900">What can you use today?</div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                      [
                        { key: 'car' as const, title: 'Driving is okay', sub: 'Prioritize parking and park-and-ride options, but still compare other strong choices.' },
                        { key: 'rideshare' as const, title: 'I need rideshare/taxi', sub: 'Shows Uber, Lyft, taxi, and non-car transit where available.' },
                        { key: 'transit' as const, title: 'Transit only', sub: 'No car or rideshare.' },
                        { key: 'all' as const, title: 'No preference — compare everything', sub: 'Show car, rideshare, taxi, transit, parking, and park-and-ride.' },
                      ] as Array<{ key: TransportAvailability; title: string; sub: string }>
                    ).map((opt) => {
                      const selected = state.transportAvailability === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setState((s) => ({ ...s, transportAvailability: opt.key }))}
                          className={
                            'w-full rounded-2xl border p-4 text-left shadow-sm transition ' +
                            (selected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50')
                          }
                        >
                          <div className="text-sm font-semibold text-zinc-900">{opt.title}</div>
                          <div className="mt-1 text-xs text-zinc-600">{opt.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Default: No preference — compare everything</div>
                </div>

                {intent === 'flying-out' && (
                  <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-medium text-zinc-900">Airport readiness</div>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-sm font-medium text-zinc-800">Checking bags?</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, checkingBags: false }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (!state.checkingBags
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            No
                          </button>
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, checkingBags: true }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (state.checkingBags
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            Yes
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-zinc-800">Flight type</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, flightType: 'domestic' }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (state.flightType === 'domestic'
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            Domestic
                          </button>
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, flightType: 'international' }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (state.flightType === 'international'
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            International
                          </button>
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <div className="text-sm font-medium text-zinc-800">Security option</div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {(
                            [
                              { key: 'standard' as const, label: 'Standard TSA' },
                              { key: 'precheck' as const, label: 'TSA PreCheck' },
                              { key: 'clear' as const, label: 'CLEAR' },
                              { key: 'clear-precheck' as const, label: 'CLEAR + PreCheck' },
                            ] as Array<{ key: SecurityOption; label: string }>
                          ).map((opt) => {
                            const selected = state.securityOption === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => setState((s) => ({ ...s, securityOption: opt.key }))}
                                className={
                                  'rounded-xl border px-3 py-2 text-left text-sm font-medium ' +
                                  (selected
                                    ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                    : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                                }
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <div className="text-sm font-medium text-zinc-800">Cabin (optional)</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, cabin: 'economy' }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (state.cabin === 'economy'
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            Economy
                          </button>
                          <button
                            type="button"
                            onClick={() => setState((s) => ({ ...s, cabin: 'premium' }))}
                            className={
                              'rounded-xl border px-3 py-2 text-sm font-medium ' +
                              (state.cabin === 'premium'
                                ? 'border-blue-500 bg-blue-50 text-zinc-900'
                                : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50')
                            }
                          >
                            Premium/Business/First
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {intentCopy(intent).wantsAirline && (
                  <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-zinc-800">
                      Airline or flight number (optional)
                    </label>
                    <input
                      value={state.airlineOrFlight}
                      onChange={(e) => setState((s) => ({ ...s, airlineOrFlight: e.target.value }))}
                      placeholder="e.g., Alaska, AS 123, DL42"
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="mt-2 text-xs text-zinc-500">
                      Optional — helps us suggest the right SeaTac check-in area.
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-800">Date</label>
                  <input
                    type="date"
                    value={state.date}
                    onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-800">
                    {intentCopy(intent).timeLabel}
                  </label>
                  <input
                    type="time"
                    value={state.time}
                    onChange={(e) => {
                      setTimeTouched(true);
                      setState((s) => ({ ...s, time: e.target.value }));
                    }}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    aria-label="Trip time"
                  />
                  {/* Intent-specific placeholder/helper for time when blank */}
                  {state.time === '' && intent === 'flying-out' && (
                    <div className="mt-2 text-xs text-zinc-500">Select flight departure time</div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <AddressInput
                    label="Origin address"
                    value={state.origin}
                    onChange={(origin) => setState((s) => ({ ...s, origin }))}
                    placeholder="Start typing your address"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-medium text-zinc-900">Destination</div>
                    <div className="mt-1 text-base font-semibold text-zinc-900">SeaTac Airport</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      {seatacZone?.note ? seatacZone.note : 'We’ll route you to the correct check-in area.'}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">{getSeatacRideshareDropoffNote()}</div>
                  </div>
                </div>

                {intentCopy(intent).wantsParkingDuration && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-800">
                      Parking duration (hours)
                      <span className="ml-1 text-xs font-normal text-zinc-500">Optional</span>
                    </label>
                    <input
                      type="number"
                      value={state.parkingDurationHours}
                      onChange={(e) => setState((s) => ({ ...s, parkingDurationHours: e.target.value }))}
                      placeholder="e.g., 24 for 1 day"
                      min="0.5"
                      step="0.5"
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>

              {/* Near-time warning (non-blocking) - only show after user edited/selected time */}
              {timeTouched && state.date && state.time && (() => {
                const combined = new Date(`${state.date}T${state.time}`);
                const now = new Date();
                if (!isNaN(combined.getTime())) {
                  const mins = Math.ceil((combined.getTime() - now.getTime()) / 60000);
                  if (mins > 0 && mins < 60) {
                    return (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Your trip time is very soon. You may need to leave immediately or consider the fastest option.
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 py-3 text-base font-medium text-zinc-900 hover:bg-zinc-50"
                >
                  Back
                </button>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  See options
                </button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
