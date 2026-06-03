'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import AccountSectionsNav from '../AccountSectionsNav';
import {
  deleteSavedParkingLot,
  readSavedParkingLots,
  type SavedParkingLot,
  upsertSavedParkingLot,
} from '../../../lib/trip/travelPreferences';
import type { SavedDestinationAccessType } from '../../../lib/trip/savedDestinations';
import { trackEvent } from '../../../lib/analytics/trackEvent';

const ACCESS_TYPE_OPTIONS: SavedDestinationAccessType[] = [
  'free',
  'paid',
  'validated',
  'employee-only',
  'permit',
  'unknown',
];

function formatAccessType(value: SavedDestinationAccessType): string {
  switch (value) {
    case 'free':
      return 'Free';
    case 'paid':
      return 'Paid';
    case 'validated':
      return 'Validated';
    case 'employee-only':
      return 'Employee only';
    case 'permit':
      return 'Permit';
    default:
      return 'Unknown';
  }
}

export default function SavedParkingLotsPage() {
  const [lots, setLots] = useState<SavedParkingLot[]>([]);
  const [label, setLabel] = useState('');
  const [lotName, setLotName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [accessType, setAccessType] = useState<SavedDestinationAccessType>('unknown');

  useEffect(() => {
    setLots(readSavedParkingLots());
  }, []);

  const handleSave = () => {
    if (!lotName.trim()) return;

    const next = upsertSavedParkingLot({
      label: label.trim() || lotName.trim(),
      lotName: lotName.trim(),
      address: address.trim() || null,
      notes: notes.trim() || null,
      accessType,
    });
    trackEvent('save_parking_lot_clicked', {
      eventProperties: { accessType },
    });
    setLots(next);
    setLabel('');
    setLotName('');
    setAddress('');
    setNotes('');
    setAccessType('unknown');
  };

  const handleDelete = (id: string) => {
    setLots(deleteSavedParkingLot(id));
  };

  return (
    <main className="airport-page-bg min-h-screen text-slate-950">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-[0_18px_60px_rgba(14,116,144,0.12)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-950">Your account</h1>
              <p className="mt-2 text-sm text-slate-600">
                Saved parking lots are separate from saved trips and destinations.
              </p>
            </div>
            <Link
              href="/login?redirect=/account/parking-lots"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>

          <AccountSectionsNav />

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-950">Saved parking lots</h2>
            <p className="mt-1 text-sm text-slate-600">
              Keep known parking lots and access notes on this device.
            </p>

            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Downtown garage"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Lot name</span>
                <input
                  value={lotName}
                  onChange={(event) => setLotName(event.target.value)}
                  placeholder="Pacific Place Garage"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Address</span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="600 Pine St, Seattle, WA"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Access type</span>
                <select
                  value={accessType}
                  onChange={(event) =>
                    setAccessType(event.target.value as SavedDestinationAccessType)
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  {ACCESS_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatAccessType(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional access notes"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  rows={2}
                />
              </label>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex w-fit items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save parking lot
              </button>
            </div>

            {lots.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No saved parking lots yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {lots.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-slate-950">{item.label || item.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{item.name}</div>
                        {item.address ? (
                          <div className="mt-1 text-sm text-slate-600">{item.address}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-slate-500">
                          Access: {formatAccessType(item.accessType ?? 'unknown')}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
