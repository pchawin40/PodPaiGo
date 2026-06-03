'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import AccountSectionsNav from '../AccountSectionsNav';
import {
  deleteSavedDestination,
  readSavedDestinations,
  type SavedDestination,
  type SavedDestinationAccessType,
  upsertSavedDestination,
} from '../../../lib/trip/savedDestinations';
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

export default function SavedDestinationsPage() {
  const [destinations, setDestinations] = useState<SavedDestination[]>([]);
  const [label, setLabel] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [accessType, setAccessType] = useState<SavedDestinationAccessType>('unknown');

  useEffect(() => {
    setDestinations(readSavedDestinations());
  }, []);

  const handleSave = () => {
    if (!destination.trim()) return;

    const next = upsertSavedDestination({
      label: label.trim() || destination.trim(),
      destination: destination.trim(),
      notes: notes.trim() || null,
      accessType,
    });
    trackEvent('save_destination_clicked', {
      eventProperties: { accessType, destinationCategory: 'saved_destination' },
    });
    setDestinations(next);
    setLabel('');
    setDestination('');
    setNotes('');
    setAccessType('unknown');
  };

  const handleDelete = (id: string) => {
    setDestinations(deleteSavedDestination(id));
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
                Saved destinations are separate from saved trips and parking lots.
              </p>
            </div>
            <Link
              href="/login?redirect=/account/destinations"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>

          <AccountSectionsNav />

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-950">Saved destinations</h2>
            <p className="mt-1 text-sm text-slate-600">
              These appear in Quick Go destination search on this device.
            </p>

            <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Fred Meyer Monroe"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Destination address</span>
                <input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="19500 Hwy 2, Monroe, WA"
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
                  placeholder="Optional parking notes"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  rows={2}
                />
              </label>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex w-fit items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save destination
              </button>
            </div>

            {destinations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No saved destinations yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {destinations.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-slate-950">{item.label}</div>
                        <div className="mt-1 text-sm text-slate-600">{item.destination}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Access: {formatAccessType(item.accessType)}
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
