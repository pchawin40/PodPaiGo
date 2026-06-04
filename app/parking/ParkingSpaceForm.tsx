'use client';

import { FormEvent, useMemo, useState } from 'react';
import type {
  UserParkingSpaceInput,
  UserParkingSpaceRecord,
  UserParkingType,
} from '../../lib/parking/userParkingSpacesTypes';
import {
  USER_PARKING_TYPE_LABELS,
  USER_PARKING_TYPES,
} from '../../lib/parking/userParkingSpacesTypes';

type ParkingSpaceFormProps = {
  accessToken: string;
  initial?: UserParkingSpaceRecord | null;
  onSaved?: (record: UserParkingSpaceRecord) => void;
  onCancel?: () => void;
};

function inputValue(value: string | null | undefined): string {
  return value ?? '';
}

export default function ParkingSpaceForm({
  accessToken,
  initial = null,
  onSaved,
  onCancel,
}: ParkingSpaceFormProps) {
  const [name, setName] = useState(inputValue(initial?.name));
  const [address, setAddress] = useState(inputValue(initial?.address));
  const [parkingType, setParkingType] = useState<UserParkingType>(
    initial?.parking_type ?? 'free',
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    initial?.time_limit_minutes ? String(initial.time_limit_minutes) : '',
  );
  const [overnightAllowed, setOvernightAllowed] = useState(
    initial?.overnight_allowed === true
      ? 'yes'
      : initial?.overnight_allowed === false
        ? 'no'
        : 'unknown',
  );
  const [validationRequired, setValidationRequired] = useState(
    Boolean(initial?.validation_required),
  );
  const [businessName, setBusinessName] = useState(inputValue(initial?.business_name));
  const [lotRules, setLotRules] = useState(inputValue(initial?.lot_rules));
  const [notes, setNotes] = useState(inputValue(initial?.notes));
  const [evidenceUrl, setEvidenceUrl] = useState(inputValue(initial?.evidence_url));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitLabel = useMemo(
    () => (initial ? 'Save changes' : 'Submit for verification'),
    [initial],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: UserParkingSpaceInput = {
      name,
      address,
      parking_type: parkingType,
      time_limit_minutes: timeLimitMinutes.trim() ? Number(timeLimitMinutes) : null,
      overnight_allowed:
        overnightAllowed === 'yes' ? true : overnightAllowed === 'no' ? false : null,
      validation_required: validationRequired,
      business_name: businessName || null,
      lot_rules: lotRules || null,
      notes: notes || null,
      evidence_url: evidenceUrl || null,
    };

    try {
      const response = await fetch(
        initial ? `/api/parking/user-spaces/${initial.id}` : '/api/parking/user-spaces',
        {
          method: initial ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        parking?: UserParkingSpaceRecord;
        message?: string;
      };

      if (!response.ok || !data.parking) {
        throw new Error(data.message || `Save failed (${response.status})`);
      }

      setMessage('Submitted for verification.');
      onSaved?.(data.parking);
      if (!initial) {
        setName('');
        setAddress('');
        setParkingType('free');
        setTimeLimitMinutes('');
        setOvernightAllowed('unknown');
        setValidationRequired(false);
        setBusinessName('');
        setLotRules('');
        setNotes('');
        setEvidenceUrl('');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save parking.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Parking name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="Safeway lot on Main St"
          />
        </label>

        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Address
          <input
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="123 Main St, Bellevue, WA"
          />
        </label>

        <label className="block text-sm font-medium text-foreground">
          Type of free parking
          <select
            value={parkingType}
            onChange={(event) => setParkingType(event.target.value as UserParkingType)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
          >
            {USER_PARKING_TYPES.map((type) => (
              <option key={type} value={type}>
                {USER_PARKING_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-foreground">
          Time limit, minutes
          <input
            type="number"
            min={0}
            value={timeLimitMinutes}
            onChange={(event) => setTimeLimitMinutes(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="Optional"
          />
        </label>

        <label className="block text-sm font-medium text-foreground">
          Overnight allowed?
          <select
            value={overnightAllowed}
            onChange={(event) => setOvernightAllowed(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
          >
            <option value="unknown">Not sure</option>
            <option value="yes">Yes, signs allow it</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="flex items-center gap-2 self-end rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={validationRequired}
            onChange={(event) => setValidationRequired(event.target.checked)}
          />
          Customer-only or validation required
        </label>

        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Business name
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="Optional"
          />
        </label>

        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Rules seen on sign
          <textarea
            value={lotRules}
            onChange={(event) => setLotRules(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            rows={3}
            placeholder="Example: 2 hour customer parking, no overnight"
          />
        </label>

        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            rows={3}
            placeholder="Anything PodPaiGo should verify"
          />
        </label>

        <label className="block text-sm font-medium text-foreground sm:col-span-2">
          Evidence link
          <input
            type="url"
            value={evidenceUrl}
            onChange={(event) => setEvidenceUrl(event.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            placeholder="Optional photo, city page, or business page URL"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
