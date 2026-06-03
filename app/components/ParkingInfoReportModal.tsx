'use client';

import { FormEvent, useState } from 'react';
import type { ParkingAccessType } from '../../lib/parking/destinationParkingClassifier';

export type ParkingReportContext = {
  parkingLotId?: string | null;
  lotName?: string | null;
  airportCode?: string | null;
  destinationText?: string | null;
};

type ParkingInfoReportModalProps = {
  open: boolean;
  onClose: () => void;
  context?: ParkingReportContext;
};

const REPORT_TYPES = [
  { value: 'free', label: 'Free parking' },
  { value: 'validated', label: 'Validated parking' },
  { value: 'paid_only', label: 'Paid only' },
  { value: 'restricted', label: 'Restricted / private' },
  { value: 'wrong_info', label: 'Wrong info' },
] as const;

const ACCESS_OPTIONS: { value: ParkingAccessType; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'customer_only', label: 'Customer only' },
  { value: 'validated_customer', label: 'Validated customer' },
  { value: 'employee_only', label: 'Employee only' },
  { value: 'tenant_only', label: 'Tenant only' },
  { value: 'permit_only', label: 'Permit only' },
  { value: 'event_only', label: 'Event / visitor' },
  { value: 'trailhead_permit', label: 'Trailhead permit' },
  { value: 'unknown', label: 'Unknown' },
];

export default function ParkingInfoReportModal({
  open,
  onClose,
  context = {},
}: ParkingInfoReportModalProps) {
  const [reportType, setReportType] = useState<string>('free');
  const [freeMinutes, setFreeMinutes] = useState('');
  const [validationBusiness, setValidationBusiness] = useState('');
  const [accessType, setAccessType] = useState<ParkingAccessType>('unknown');
  const [badgeRequired, setBadgeRequired] = useState(false);
  const [permitRequired, setPermitRequired] = useState(false);
  const [visitorAllowed, setVisitorAllowed] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setReportType('free');
    setFreeMinutes('');
    setValidationBusiness('');
    setAccessType('unknown');
    setBadgeRequired(false);
    setPermitRequired(false);
    setVisitorAllowed(true);
    setNotes('');
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const parsedFreeMinutes =
        freeMinutes.trim() === '' ? null : Number.parseInt(freeMinutes, 10);

      const response = await fetch('/api/parking/validation-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: reportType,
          validation_status: reportType === 'wrong_info' ? null : reportType,
          parking_lot_id: context.parkingLotId ?? null,
          lot_name: context.lotName ?? null,
          airport_code: context.airportCode ?? null,
          destination_text: context.destinationText ?? null,
          free_minutes: Number.isFinite(parsedFreeMinutes) ? parsedFreeMinutes : null,
          validation_business: validationBusiness.trim() || null,
          access_type: accessType,
          badge_required: badgeRequired,
          permit_required: permitRequired,
          visitor_allowed: visitorAllowed,
          notes: notes.trim() || null,
        }),
      });

      const data = (await response.json()) as { message?: string; ok?: boolean };
      if (!response.ok) {
        throw new Error(data.message || 'Could not submit report.');
      }

      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parking-report-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="parking-report-title" className="text-lg font-semibold text-zinc-900">
              Report parking info
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Help improve parking rules for this destination. Reports are reviewed before publishing.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Thanks — your parking report was submitted for review.
            <button
              type="button"
              onClick={handleClose}
              className="mt-3 block rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-zinc-900">
                Is this free, validated, paid only, restricted, or wrong info?
              </span>
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
              >
                {REPORT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Free minutes</span>
              <input
                type="number"
                min={0}
                value={freeMinutes}
                onChange={(event) => setFreeMinutes(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                placeholder="Optional"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Business that validates</span>
              <input
                type="text"
                value={validationBusiness}
                onChange={(event) => setValidationBusiness(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                placeholder="Optional"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Access type</span>
              <select
                value={accessType}
                onChange={(event) => setAccessType(event.target.value as ParkingAccessType)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
              >
                {ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={badgeRequired}
                  onChange={(event) => setBadgeRequired(event.target.checked)}
                />
                Badge required
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permitRequired}
                  onChange={(event) => setPermitRequired(event.target.checked)}
                />
                Permit required
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visitorAllowed}
                  onChange={(event) => setVisitorAllowed(event.target.checked)}
                />
                Visitor allowed
              </label>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                placeholder="Optional details"
              />
            </label>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
