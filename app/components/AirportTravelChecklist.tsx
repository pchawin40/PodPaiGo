'use client';

import { useMemo, useState } from 'react';
import type { BagPlan } from '../../lib/types';

export type AirportTravelChecklistItem = {
  id: string;
  label: string;
  defaultChecked?: boolean;
};

export type AirportTravelChecklistProps = {
  bagPlan?: BagPlan;
  hasParkingOrRidesharePlan?: boolean;
  returnDate?: string | null;
  className?: string;
};

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

export default function AirportTravelChecklist({
  bagPlan = 'none',
  hasParkingOrRidesharePlan = false,
  returnDate = null,
  className = '',
}: AirportTravelChecklistProps) {
  const items = useMemo(
    () =>
      buildAirportTravelChecklistItems({
        bagPlan,
        hasParkingOrRidesharePlan,
        returnDate,
      }),
    [bagPlan, hasParkingOrRidesharePlan, returnDate],
  );

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.defaultChecked ?? false])),
  );

  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        Travel checklist
      </div>
      <ul className="mt-2 space-y-2">
        {items.map((item) => {
          const done = checked[item.id] ?? false;
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm text-slate-100">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) =>
                    setChecked((current) => ({
                      ...current,
                      [item.id]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-sky-400 focus:ring-sky-300"
                />
                <span className={done ? 'text-slate-400 line-through' : undefined}>{item.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
