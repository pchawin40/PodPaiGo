'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import TripAssistantConfirm from './TripAssistantConfirm';

const EXAMPLE_PROMPTS = [
  'I’m flying from SEA to Las Vegas Friday night and coming back Sunday',
  'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18',
  'Need parking at LAX for 4 days',
];

type TripAssistantPanelProps = {
  className?: string;
};

export default function TripAssistantPanel({ className = '' }: TripAssistantPanelProps) {
  const router = useRouter();
  const [userText, setUserText] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmed(false);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/parse-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Could not parse trip.');
      }

      setParsed(data as ParsedTripAssistantResult);
    } catch (parseError) {
      setParsed(null);
      setError(parseError instanceof Error ? parseError.message : 'Could not parse trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!parsed) return;

    const params = parsedTripToSearchParams(parsed, { confirmed: true });
    if (!params) {
      setError('Please fill origin, airport, and departure date before continuing.');
      return;
    }

    setConfirmed(true);
    router.push(buildResultsPathFromSearchParams(params));
  };

  const handleCancel = () => {
    setParsed(null);
    setConfirmed(false);
    setError(null);
  };

  return (
    <section
      className={
        'rounded-3xl border border-sky-100 bg-white/95 p-5 shadow-[0_18px_60px_rgba(14,116,144,0.12)] sm:p-6 ' +
        className
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Describe your airport trip</h2>
          <p className="mt-1 text-sm text-slate-600">
            Type a natural-language trip request. We&apos;ll parse it first, then you confirm before
            running recommendations.
          </p>
        </div>

        <button
          type="button"
          disabled
          title="Voice input coming soon"
          aria-label="Voice input coming soon"
          className="inline-flex items-center gap-2 self-start rounded-full border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500"
        >
          <span aria-hidden="true">🎤</span>
          Voice soon
        </button>
      </div>

      <form onSubmit={handleParse} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Trip description
          <textarea
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            rows={4}
            placeholder="Weekend trip to Las Vegas from SEA Nov 15 to Nov 18, leaving from Monroe. Find best parking and leave time."
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setUserText(example)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              {example}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!userText.trim() || loading}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Parsing…' : 'Parse trip'}
        </button>
      </form>

      {parsed && !confirmed ? (
        <div className="mt-5">
          <TripAssistantConfirm
            parsed={parsed}
            onChange={setParsed}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        </div>
      ) : null}
    </section>
  );
}
