'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import { useAuth } from './AuthProvider';
import TripAssistantConfirm from './TripAssistantConfirm';

const EXAMPLE_PROMPTS = [
  'I’m flying from SEA to Las Vegas Friday night and coming back Sunday',
  'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18',
  'Need parking at LAX for 4 days',
];

type TripAssistantPanelProps = {
  className?: string;
};

type ParseTripApiResponse = ParsedTripAssistantResult & {
  liveProviderActive?: boolean;
  configuredProvider?: 'mock' | 'openai';
  requiresConfirmation?: boolean;
};

export default function TripAssistantPanel({ className = '' }: TripAssistantPanelProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [userText, setUserText] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [liveProviderActive, setLiveProviderActive] = useState(false);
  const [configuredProvider, setConfiguredProvider] = useState<'mock' | 'openai'>('mock');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(
    () => `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const accessToken = session?.access_token ?? null;

  const assistantStatusLabel = useMemo(() => {
    if (loading) return 'AI parse in progress…';
    if (parsed) return 'Review before running';
    return liveProviderActive ? 'Using AI assistant' : 'Mock parser';
  }, [loading, parsed, liveProviderActive]);

  const handleParse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmed(false);
    setLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/ai/parse-trip', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userText, sessionId }),
      });

      const data = (await response.json()) as ParseTripApiResponse & { message?: string };
      if (!response.ok) {
        throw new Error(data.message || 'Could not parse trip.');
      }

      setParsed(data);
      setLiveProviderActive(Boolean(data.liveProviderActive));
      setConfiguredProvider(data.configuredProvider === 'openai' ? 'openai' : 'mock');
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

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
            {assistantStatusLabel}
          </span>
          <span className="text-xs text-slate-500">
            {liveProviderActive ? 'Using AI assistant' : 'Mock parser in development'}
          </span>
        </div>
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
          {loading ? 'AI parse…' : 'Generate trip plan'}
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
          <p className="mt-3 text-xs text-slate-500">
            Review before running. Provider: {parsed.parser}
            {configuredProvider === 'openai' ? ' (live configured)' : ' (mock/dev fallback)'}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
