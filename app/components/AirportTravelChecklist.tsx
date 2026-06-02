'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { BagPlan } from '../../lib/types';

export type AirportTravelChecklistItem = {
  id: string;
  label: string;
  defaultChecked?: boolean;
  custom?: boolean;
};

export type AirportTravelChecklistProps = {
  bagPlan?: BagPlan;
  hasParkingOrRidesharePlan?: boolean;
  returnDate?: string | null;
  /** Stable per-trip key for localStorage (e.g. SEA:2026-06-01:12:00). */
  storageKey?: string | null;
  className?: string;
  showHeading?: boolean;
};

export type AirportChecklistPersistedState = {
  checked: Record<string, boolean>;
  customItems: AirportTravelChecklistItem[];
};

export const AIRPORT_CHECKLIST_STORAGE_PREFIX = 'podpaigo:airportChecklist:';

export function buildAirportTravelChecklistItems(input: {
  bagPlan?: BagPlan;
  hasParkingOrRidesharePlan?: boolean;
  returnDate?: string | null;
}): AirportTravelChecklistItem[] {
  const bagPlan = input.bagPlan ?? 'none';
  const items: AirportTravelChecklistItem[] = [
    { id: 'id-passport', label: 'ID / passport' },
    { id: 'boarding-pass', label: 'Boarding pass' },
    {
      id: 'parking-rideshare',
      label: 'Parking reservation / rideshare plan',
      defaultChecked: Boolean(input.hasParkingOrRidesharePlan),
    },
    { id: 'tsa-liquids', label: 'TSA liquids (3-1-1 rule)' },
    { id: 'charger', label: 'Phone charger / power bank' },
  ];

  if (bagPlan === 'checked' || bagPlan === 'oversized') {
    items.push({
      id: 'bag-cutoff',
      label:
        bagPlan === 'oversized'
          ? 'Oversized / special item drop-off cutoff'
          : 'Checked bag drop-off cutoff',
    });
  }

  if (input.returnDate?.trim()) {
    items.push({
      id: 'return-reminder',
      label: `Return trip reminder (${input.returnDate.trim()})`,
    });
  }

  return items;
}

export function buildAirportChecklistStorageKey(tripKey: string): string {
  const normalized = tripKey.trim();
  return `${AIRPORT_CHECKLIST_STORAGE_PREFIX}${normalized || 'default'}`;
}

export function buildDefaultChecklistState(
  items: AirportTravelChecklistItem[],
): AirportChecklistPersistedState {
  return {
    checked: Object.fromEntries(items.map((item) => [item.id, item.defaultChecked ?? false])),
    customItems: [],
  };
}

export function parseAirportChecklistStorage(
  raw: string | null,
): AirportChecklistPersistedState | null {
  if (!raw?.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AirportChecklistPersistedState>;
    if (!parsed || typeof parsed !== 'object') return null;

    const checked =
      parsed.checked && typeof parsed.checked === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.checked).filter(
              ([, value]) => typeof value === 'boolean',
            ),
          )
        : {};

    const customItems = Array.isArray(parsed.customItems)
      ? parsed.customItems
          .filter(
            (item): item is AirportTravelChecklistItem =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as AirportTravelChecklistItem).id === 'string' &&
              typeof (item as AirportTravelChecklistItem).label === 'string' &&
              (item as AirportTravelChecklistItem).id.startsWith('custom-') &&
              Boolean((item as AirportTravelChecklistItem).label.trim()),
          )
          .map((item) => ({
            id: item.id,
            label: item.label.trim(),
            custom: true as const,
          }))
      : [];

    return { checked, customItems };
  } catch {
    return null;
  }
}

export function mergeChecklistStateWithDefaults(
  defaultItems: AirportTravelChecklistItem[],
  persisted: AirportChecklistPersistedState | null,
): AirportChecklistPersistedState {
  const base = buildDefaultChecklistState(defaultItems);
  if (!persisted) return base;

  const checked = { ...base.checked };
  for (const [id, value] of Object.entries(persisted.checked)) {
    if (id in checked || id.startsWith('custom-')) {
      checked[id] = value;
    }
  }

  for (const item of persisted.customItems) {
    if (!(item.id in checked)) {
      checked[item.id] = false;
    }
  }

  return {
    checked,
    customItems: persisted.customItems,
  };
}

function readPersistedState(
  storageKey: string | null | undefined,
  defaultItems: AirportTravelChecklistItem[],
): AirportChecklistPersistedState {
  const base = buildDefaultChecklistState(defaultItems);
  if (!storageKey?.trim() || typeof window === 'undefined') {
    return base;
  }

  try {
    const raw = window.localStorage.getItem(buildAirportChecklistStorageKey(storageKey));
    return mergeChecklistStateWithDefaults(defaultItems, parseAirportChecklistStorage(raw));
  } catch {
    return base;
  }
}

function writePersistedState(
  storageKey: string | null | undefined,
  state: AirportChecklistPersistedState,
): void {
  if (!storageKey?.trim() || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      buildAirportChecklistStorageKey(storageKey),
      JSON.stringify({
        checked: state.checked,
        customItems: state.customItems,
      }),
    );
  } catch {
    // Ignore quota / private mode errors.
  }
}

function createCustomItemId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AirportTravelChecklist({
  bagPlan = 'none',
  hasParkingOrRidesharePlan = false,
  returnDate = null,
  storageKey = null,
  className = '',
  showHeading = true,
}: AirportTravelChecklistProps) {
  const addInputId = useId();
  const defaultItems = useMemo(
    () =>
      buildAirportTravelChecklistItems({
        bagPlan,
        hasParkingOrRidesharePlan,
        returnDate,
      }),
    [bagPlan, hasParkingOrRidesharePlan, returnDate],
  );

  const [state, setState] = useState<AirportChecklistPersistedState>(() =>
    readPersistedState(storageKey, defaultItems),
  );
  const [isAdding, setIsAdding] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState('');

  useEffect(() => {
    setState(readPersistedState(storageKey, defaultItems));
  }, [storageKey, defaultItems]);

  useEffect(() => {
    writePersistedState(storageKey, state);
  }, [storageKey, state]);

  const displayItems = useMemo(
    () => [...defaultItems, ...state.customItems],
    [defaultItems, state.customItems],
  );

  function toggleChecked(itemId: string, checked: boolean) {
    setState((current) => ({
      ...current,
      checked: {
        ...current.checked,
        [itemId]: checked,
      },
    }));
  }

  function addCustomItem(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;

    const id = createCustomItemId();
    setState((current) => ({
      checked: {
        ...current.checked,
        [id]: false,
      },
      customItems: [...current.customItems, { id, label: trimmed, custom: true }],
    }));
    setNewItemLabel('');
    setIsAdding(false);
  }

  function deleteCustomItem(itemId: string) {
    setState((current) => {
      const nextChecked = { ...current.checked };
      delete nextChecked[itemId];

      return {
        checked: nextChecked,
        customItems: current.customItems.filter((item) => item.id !== itemId),
      };
    });
  }

  function resetChecklist() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Reset checklist to defaults? This removes custom items and clears your checks.')
    ) {
      return;
    }

    setState(buildDefaultChecklistState(defaultItems));
    setIsAdding(false);
    setNewItemLabel('');
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        {showHeading ? (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Travel checklist
          </div>
        ) : (
          <span className="sr-only">Travel checklist</span>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAdding((open) => !open)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-white/10"
          >
            + Add item
          </button>
          <button
            type="button"
            onClick={resetChecklist}
            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-white/5 hover:text-slate-100"
          >
            Reset
          </button>
        </div>
      </div>

      {isAdding ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addCustomItem(newItemLabel);
          }}
        >
          <label htmlFor={addInputId} className="sr-only">
            New checklist item
          </label>
          <input
            id={addInputId}
            type="text"
            value={newItemLabel}
            onChange={(event) => setNewItemLabel(event.target.value)}
            placeholder="Add your own item"
            maxLength={120}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/8 px-2.5 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-400/40 focus:outline-none focus:ring-1 focus:ring-sky-400/30"
            autoFocus
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-sky-500/90 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-400"
          >
            Add
          </button>
        </form>
      ) : null}

      <ul className="mt-2 space-y-2">
        {displayItems.map((item) => {
          const done = state.checked[item.id] ?? false;
          const isCustom = item.custom === true || item.id.startsWith('custom-');

          return (
            <li key={item.id}>
              <div className="flex items-center gap-1 rounded-xl bg-white/6 pr-1">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(event) => toggleChecked(item.id, event.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-white/20 bg-white/10 text-sky-400 focus:ring-sky-300"
                  />
                  <span className={done ? 'text-slate-400 line-through' : undefined}>
                    {item.label}
                  </span>
                </label>
                {isCustom ? (
                  <button
                    type="button"
                    aria-label={`Remove ${item.label}`}
                    onClick={() => deleteCustomItem(item.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-rose-200"
                  >
                    <span aria-hidden>×</span>
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
