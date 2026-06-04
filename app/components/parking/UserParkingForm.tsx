'use client';

import { FormEvent, useState } from 'react';
import {
  USER_PARKING_TYPES,
  USER_PARKING_TYPE_LABELS,
  type UserParkingSpaceInput,
  type UserParkingType,
} from '../../../lib/parking/userParkingSpacesTypes';

type UserParkingFormProps = {
  initial?: Partial<UserParkingSpaceInput>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (input: UserParkingSpaceInput) => void;
  onCancel?: () => void;
};

const inputClass =
  'mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';

export default function UserParkingForm({
  initial,
  submitting = false,
  submitLabel = 'Submit free parking',
  onSubmit,
  onCancel,
}: UserParkingFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [parkingType, setParkingType] = useState<UserParkingType>(initial?.parking_type ?? 'free');
  const [timeLimit, setTimeLimit] = useState(
    initial?.time_limit_minutes != null ? String(initial.time_limit_minutes) : '',
  );
  const [overnight, setOvernight] = useState<'unknown' | 'yes' | 'no'>(
    initial?.overnight_allowed === true ? 'yes' : initial?.overnight_allowed === false ? 'no' : 'unknown',
  );
  const [validationRequired, setValidationRequired] = useState(Boolean(initial?.validation_required));
  const [businessName, setBusinessName] = useState(initial?.business_name ?? '');
  const [lotRules, setLotRules] = useState(initial?.lot_rules ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [evidenceUrl, setEvidenceUrl] = useState(initial?.evidence_url ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Parking name is required.');
      return;
    }
    if (!address.trim()) {
      setLocalError('Address is required.');
      return;
    }

    onSubmit({
      name: name.trim(),
      address: address.trim(),
      parking_type: parkingType,
      time_limit_minutes: timeLimit.trim() ? Number.parseInt(timeLimit.trim(), 10) : null,
      overnight_allowed: overnight === 'yes' ? true : overnight === 'no' ? false : null,
      validation_required: validationRequired,
      business_name: businessName.trim() || null,
      lot_rules: lotRules.trim() || null,
      notes: notes.trim() || null,
      evidence_url: evidenceUrl.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Parking name *</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Safeway Monroe lot"
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Address *</span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="14679 WA-9, Snohomish, WA 98296"
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Type of free parking</span>
        <select
          value={parkingType}
          onChange={(event) => setParkingType(event.target.value as UserParkingType)}
          className={inputClass}
        >
          {USER_PARKING_TYPES.map((type) => (
            <option key={type} value={type}>
              {USER_PARKING_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Time limit (minutes)</span>
          <input
            value={timeLimit}
            onChange={(event) => setTimeLimit(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="e.g. 90 (leave blank if none)"
            className={inputClass}
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-foreground">Overnight allowed?</span>
          <select
            value={overnight}
            onChange={(event) => setOvernight(event.target.value as 'unknown' | 'yes' | 'no')}
            className={inputClass}
          >
            <option value="unknown">Not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={validationRequired}
          onChange={(event) => setValidationRequired(event.target.checked)}
        />
        Customer-only / validation required (e.g. must shop or get a ticket validated)
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Business name (optional)</span>
        <input
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Safeway"
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Notes / rules seen on sign (optional)</span>
        <textarea
          value={lotRules}
          onChange={(event) => setLotRules(event.target.value)}
          rows={2}
          placeholder="2 hour customer parking, tow enforced"
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Anything else (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="Best entrance, where overflow parking is, etc."
          className={inputClass}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Evidence link (optional)</span>
        <input
          value={evidenceUrl}
          onChange={(event) => setEvidenceUrl(event.target.value)}
          placeholder="https://… photo of the sign or map link"
          className={inputClass}
        />
      </label>

      {localError ? (
        <p className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
          {localError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Submitted spots stay private and pending until PodPaiGo verifies them. Verified free
        parking can then help other travelers.
      </p>
    </form>
  );
}
