'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export const FLEXIBLE_DATE_HELPER_TEXT =
  'Use MM/DD/YYYY or YYYY-MM-DD, or pick from calendar.';

const FLEXIBLE_DATE_ERROR_TEXT =
  'Enter a valid date as MM/DD/YYYY or YYYY-MM-DD, or pick from calendar.';

function formatLocalYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeFlexibleDateInputValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : us
      ? { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) }
      : null;

  if (!parts) return null;

  const { year, month, day } = parts;
  if (![year, month, day].every(Number.isFinite)) return null;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return formatLocalYYYYMMDD(parsed);
}

function inputClass({
  hasError,
  highlighted,
}: {
  hasError: boolean;
  highlighted: boolean;
}): string {
  return [
    'ppg-readable-input min-w-0 w-full rounded-2xl border px-4 py-3 pr-12 text-base shadow-sm outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/15',
    hasError ? 'border-danger ring-4 ring-danger/15' : 'border-border',
    highlighted ? 'animate-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function openFlexibleDatePicker(dateInput: HTMLInputElement | null) {
  if (!dateInput) return;

  dateInput.focus({ preventScroll: true });

  if (typeof dateInput.showPicker === 'function') {
    try {
      dateInput.showPicker();
      return;
    } catch {
      // Fall through to click when showPicker is blocked.
    }
  }

  dateInput.click();
}

export function FlexibleDateInput({
  value,
  onChange,
  ariaLabel,
  hasError = false,
  highlighted = false,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  hasError?: boolean;
  highlighted?: boolean;
  className?: string;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const calendarValue = useMemo(() => normalizeFlexibleDateInputValue(value) || '', [value]);
  const invalid = hasError || Boolean(localError);

  useEffect(() => {
    if (!focused && value !== draftValue) {
      setDraftValue(value);
      setLocalError(null);
    }
  }, [draftValue, focused, value]);

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/DD/YYYY or YYYY-MM-DD"
          value={draftValue}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const next = event.target.value;
            setDraftValue(next);
            setLocalError(null);
            onChange(next);
          }}
          onBlur={() => {
            setFocused(false);
            const trimmed = draftValue.trim();
            if (!trimmed) {
              setLocalError(null);
              setDraftValue('');
              onChange('');
              return;
            }

            const normalized = normalizeFlexibleDateInputValue(trimmed);
            if (normalized) {
              setLocalError(null);
              setDraftValue(normalized);
              onChange(normalized);
              return;
            }

            setLocalError(FLEXIBLE_DATE_ERROR_TEXT);
          }}
          aria-label={ariaLabel}
          aria-invalid={invalid ? true : undefined}
          className={inputClass({ hasError: invalid, highlighted })}
        />
        <button
          type="button"
          aria-label="Choose date"
          onClick={() => openFlexibleDatePicker(dateInputRef.current)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openFlexibleDatePicker(dateInputRef.current);
            }
          }}
          className="absolute right-3 top-1/2 z-[2] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition hover:text-primary focus-visible:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4" />
            <path d="M8 2v4" />
            <path d="M3 10h18" />
          </svg>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={calendarValue}
          tabIndex={-1}
          onChange={(event) => {
            const normalized = normalizeFlexibleDateInputValue(event.target.value) || '';
            setFocused(false);
            setLocalError(null);
            setDraftValue(normalized);
            onChange(normalized);
          }}
          aria-hidden="true"
          title="Pick date"
          className="absolute right-3 top-1/2 z-[1] h-8 w-8 -translate-y-1/2 cursor-pointer opacity-0"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{FLEXIBLE_DATE_HELPER_TEXT}</p>
      {localError ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
