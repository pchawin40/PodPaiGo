'use client';

import { useMemo } from 'react';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import {
  normalizeAirlineTextForAssistant,
  parseFlightInput,
} from '../../lib/airlines/parseFlightInput';
import { classifyDestinationParking } from '../../lib/parking/destinationParkingClassifier';
import { quickGoParkingExpectationLabel } from '../../lib/trip/quickGo';

type TripAssistantConfirmProps = {
  parsed: ParsedTripAssistantResult;
  onChange: (next: ParsedTripAssistantResult) => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting?: boolean;
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-950"
      />
    </label>
  );
}

export default function TripAssistantConfirm({
  parsed,
  onChange,
  onConfirm,
  onCancel,
  submitting = false,
}: TripAssistantConfirmProps) {
  const isQuickGo = parsed.mode === 'quick_go';

  const canConfirm = isQuickGo
    ? Boolean(parsed.destinationText?.trim())
    : Boolean(parsed.originText?.trim()) &&
      Boolean(parsed.airportCode?.trim()) &&
      Boolean(parsed.departureDate?.trim());

  const parkingExpectation = useMemo(() => {
    if (!isQuickGo || !parsed.destinationText?.trim()) return null;
    const classification = classifyDestinationParking({
      destination: parsed.destinationText,
      destinationKind: parsed.destinationCategory || null,
    });
    return quickGoParkingExpectationLabel(classification);
  }, [isQuickGo, parsed.destinationCategory, parsed.destinationText]);

  const recognizedAirlineLabel = useMemo(() => {
    if (!parsed.airlineText?.trim()) return null;

    const normalized = normalizeAirlineTextForAssistant(parsed.airlineText);
    const flightParsed = parseFlightInput(parsed.airlineText);
    const recognized =
      Boolean(flightParsed.matchedCatalogEntry) ||
      Boolean(flightParsed.airlineCode && flightParsed.flightNumber);

    if (!recognized || !normalized) return null;
    return normalized;
  }, [parsed.airlineText]);

  const timingLabel = useMemo(() => {
    if (!parsed.departureDate) return 'Now';
    const time = parsed.departureTime || '12:00';
    return `${parsed.departureDate} at ${time}`;
  }, [parsed.departureDate, parsed.departureTime]);

  if (isQuickGo) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Review Quick Go trip</h3>
            <p className="mt-1 text-sm text-slate-600">
              Confirm your destination and starting point, then run recommendations.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {parsed.parser} · {parsed.confidence} confidence
          </span>
        </div>

        {parsed.missingFields.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Missing: {parsed.missingFields.join(', ')}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="Destination"
            value={parsed.destinationText || ''}
            onChange={(value) => onChange({ ...parsed, destinationText: value || null })}
            required
          />
          <div className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Starting point</span>
            {parsed.originText?.trim() || parsed.originSource === 'current_location' ? (
              <p className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-950">
                {parsed.originSource === 'current_location'
                  ? 'Current location'
                  : parsed.originText}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...parsed,
                      originSource: 'current_location',
                      originText: null,
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Use current location
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...parsed,
                      originSource: 'manual',
                      originText: parsed.originText || '',
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Add starting point
                </button>
              </div>
            )}
            {parsed.originSource === 'manual' && !parsed.originText?.trim() ? (
              <input
                type="text"
                value={parsed.originText || ''}
                placeholder="Enter starting address"
                onChange={(event) =>
                  onChange({
                    ...parsed,
                    originText: event.target.value || null,
                    originSource: 'manual',
                  })
                }
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-950"
              />
            ) : null}
          </div>
          <div className="text-sm">
            <span className="font-medium text-slate-700">Timing</span>
            <p className="mt-1 text-slate-600">{timingLabel}</p>
          </div>
          {parkingExpectation ? (
            <div className="text-sm">
              <span className="font-medium text-slate-700">Parking expectation</span>
              <p className="mt-1 text-slate-600">{parkingExpectation}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={!canConfirm || submitting}
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Starting…' : 'Confirm and run recommendations'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Review parsed trip</h3>
          <p className="mt-1 text-sm text-slate-600">
            Edit anything below, then confirm to run recommendations.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {parsed.parser} · {parsed.confidence} confidence
        </span>
      </div>

      {parsed.missingFields.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Missing: {parsed.missingFields.join(', ')}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field
          label="Origin"
          value={parsed.originText || ''}
          onChange={(value) => onChange({ ...parsed, originText: value || null })}
          required
        />
        <Field
          label="Airport code"
          value={parsed.airportCode || ''}
          onChange={(value) =>
            onChange({ ...parsed, airportCode: value.trim().toUpperCase() || null })
          }
          required
        />
        <Field
          label="Destination city"
          value={parsed.destinationCity || ''}
          onChange={(value) => onChange({ ...parsed, destinationCity: value || null })}
        />
        <Field
          label="Airline (optional)"
          value={parsed.airlineText || ''}
          onChange={(value) => onChange({ ...parsed, airlineText: value || null })}
        />
        {recognizedAirlineLabel ? (
          <p className="sm:col-span-2 text-xs text-slate-600">
            Detected: {recognizedAirlineLabel}
          </p>
        ) : null}
        <Field
          label="Trip type"
          value={parsed.tripType || 'one-way-departure'}
          onChange={(value) => onChange({ ...parsed, tripType: value || null })}
        />
        <Field
          label="Departure date"
          type="date"
          value={parsed.departureDate || ''}
          onChange={(value) => onChange({ ...parsed, departureDate: value || null })}
          required
        />
        <Field
          label="Departure time"
          type="time"
          value={parsed.departureTime || ''}
          onChange={(value) => onChange({ ...parsed, departureTime: value || null })}
        />
        <Field
          label="Return date"
          type="date"
          value={parsed.returnDate || ''}
          onChange={(value) => onChange({ ...parsed, returnDate: value || null })}
        />
        <Field
          label="Return time"
          type="time"
          value={parsed.returnTime || ''}
          onChange={(value) => onChange({ ...parsed, returnTime: value || null })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={parsed.needsParking}
            onChange={(event) => onChange({ ...parsed, needsParking: event.target.checked })}
          />
          Include airport parking
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={parsed.needsLeaveTime}
            onChange={(event) => onChange({ ...parsed, needsLeaveTime: event.target.checked })}
          />
          Include leave-by timing
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={!canConfirm || submitting}
          onClick={onConfirm}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Starting…' : 'Confirm and run recommendations'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
