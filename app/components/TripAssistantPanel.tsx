'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import { useAuth } from './AuthProvider';
import TripAssistantConfirm from './TripAssistantConfirm';
import StatusPill from './ui/StatusPill';

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
        'relative overflow-hidden rounded-3xl border border-border bg-card/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur dark:bg-card/75 dark:shadow-sky-950/20 sm:p-6 ' +
        className
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-travel-sky/10 blur-3xl dark:bg-travel-sky/15"
      />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-travel-teal" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              AI trip planner
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground">Describe a full airport trip</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Best for flights, parking duration, airline, bags, and timing.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusPill tone="primary">{assistantStatusLabel}</StatusPill>
          <span className="text-xs text-muted-foreground">
            {liveProviderActive ? 'Using AI assistant' : 'Mock parser in development'}
          </span>
        </div>
      </div>

      <form onSubmit={handleParse} className="relative mt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Trip description
          <textarea
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            rows={4}
            placeholder="Weekend trip to Las Vegas from SEA Nov 15 to Nov 18, leaving from Monroe. Find best parking and leave time."
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 dark:bg-muted/70"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setUserText(example)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/25 hover:bg-muted hover:text-foreground dark:bg-muted/50 dark:hover:bg-travel-sky/10 dark:hover:border-travel-sky/30 dark:hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!userText.trim() || loading}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/10 transition hover:from-sky-500 hover:to-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 dark:from-sky-500 dark:to-blue-600 dark:hover:from-sky-400 dark:hover:to-blue-500"
        >
          {loading ? 'AI parse…' : 'Generate trip plan'}
        </button>
      </form>

      {parsed && !confirmed ? (
        <div className="relative mt-5">
          <TripAssistantConfirm
            parsed={parsed}
            onChange={setParsed}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Review before running. Provider: {parsed.parser}
            {configuredProvider === 'openai' ? ' (live configured)' : ' (mock/dev fallback)'}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
