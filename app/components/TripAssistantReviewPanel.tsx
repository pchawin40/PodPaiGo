'use client';

import { useMemo, useState } from 'react';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import {
  buildTripPlanningSummary,
  type TripPlanningContext,
  type TripPlanningSummaryItem,
} from '../../lib/ai/tripPlanningConversation';
import { getRecentOrigins } from '../../lib/trip/quickGo';

type ReviewField = TripPlanningSummaryItem['field'];

type TripAssistantReviewPanelProps = {
  parsed: ParsedTripAssistantResult;
  context: TripPlanningContext;
  onChange: (next: ParsedTripAssistantResult) => void;
  onPlanTrip: () => void;
  onClose: () => void;
};

function transportOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'all', label: 'Compare all' },
    { value: 'car', label: 'Drive / park' },
    { value: 'rideshare', label: 'Rideshare' },
    { value: 'transit', label: 'Transit' },
  ];
}

function parkingOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'none', label: 'No parking' },
    { value: 'destination', label: 'At destination' },
    { value: 'nearby', label: 'Near destination' },
  ];
}

export default function TripAssistantReviewPanel({
  parsed,
  context,
  onChange,
  onPlanTrip,
  onClose,
}: TripAssistantReviewPanelProps) {
  const [editingField, setEditingField] = useState<ReviewField | null>(null);
  const summary = useMemo(
    () => buildTripPlanningSummary(parsed, context),
    [parsed, context],
  );
  const recentOrigins = useMemo(() => getRecentOrigins(), [editingField]);

  const finishEditing = () => {
    setEditingField(null);
  };

  const renderFieldEditor = (field: ReviewField) => {
    switch (field) {
      case 'originText':
        return (
          <div className="mt-2 space-y-2">
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
            />
            <div className="flex flex-wrap gap-2">
              {context.geolocationAvailable && !context.geolocationDenied ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange({
                      ...parsed,
                      originSource: 'current_location',
                      originText: null,
                    });
                    finishEditing();
                  }}
                  className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium"
                >
                  Use current location
                </button>
              ) : null}
              {recentOrigins.map((origin) => (
                <button
                  key={origin}
                  type="button"
                  onClick={() => {
                    onChange({
                      ...parsed,
                      originText: origin,
                      originSource: 'manual',
                    });
                    finishEditing();
                  }}
                  className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium"
                >
                  {origin}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={finishEditing}
              className="text-xs font-medium text-primary"
            >
              Done
            </button>
          </div>
        );
      case 'destinationText':
        return (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={parsed.destinationText || ''}
              placeholder="Where are you going?"
              onChange={(event) =>
                onChange({
                  ...parsed,
                  destinationText: event.target.value || null,
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={finishEditing}
              className="text-xs font-medium text-primary"
            >
              Done
            </button>
          </div>
        );
      case 'targetTime':
        return (
          <div className="mt-2 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="date"
                value={parsed.departureDate || ''}
                onChange={(event) =>
                  onChange({
                    ...parsed,
                    departureDate: event.target.value || null,
                    timeAnchor: parsed.timeAnchor === 'now' ? 'arrive_by' : parsed.timeAnchor,
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
              />
              <input
                type="time"
                value={parsed.departureTime || ''}
                onChange={(event) =>
                  onChange({
                    ...parsed,
                    departureTime: event.target.value || null,
                    timeAnchor: parsed.timeAnchor === 'now' ? 'arrive_by' : parsed.timeAnchor,
                  })
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={finishEditing}
              className="text-xs font-medium text-primary"
            >
              Done
            </button>
          </div>
        );
      case 'transportAvailability':
        return (
          <div className="mt-2 space-y-2">
            <select
              value={parsed.transportAvailability || 'all'}
              onChange={(event) =>
                onChange({
                  ...parsed,
                  transportAvailability: event.target.value as ParsedTripAssistantResult['transportAvailability'],
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
            >
              {transportOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={finishEditing}
              className="text-xs font-medium text-primary"
            >
              Done
            </button>
          </div>
        );
      case 'parkingPreference':
        return (
          <div className="mt-2 space-y-2">
            <select
              value={parsed.parkingPreference || 'nearby'}
              onChange={(event) =>
                onChange({
                  ...parsed,
                  parkingPreference: event.target.value as ParsedTripAssistantResult['parkingPreference'],
                  needsParking: event.target.value !== 'none',
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-900"
            >
              {parkingOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={finishEditing}
              className="text-xs font-medium text-primary"
            >
              Done
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">Trip details</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {summary.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 dark:border-slate-600 dark:bg-slate-900/60"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {item.label}
                </div>
                <div className="truncate text-sm text-slate-950 dark:text-slate-100">
                  {item.value}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingField((current) => (current === item.field ? null : item.field))
                }
                className="shrink-0 rounded-full border border-primary/25 px-2.5 py-1 text-xs font-medium text-primary"
              >
                Change
              </button>
            </div>
            {editingField === item.field ? renderFieldEditor(item.field) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPlanTrip}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Plan trip
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        >
          Back to chat
        </button>
      </div>
    </div>
  );
}
