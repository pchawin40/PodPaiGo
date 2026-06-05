'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '../../lib/analytics/trackEvent';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import { useAuth } from './AuthProvider';
import TripAssistantConfirm from './TripAssistantConfirm';
import StatusPill from './ui/StatusPill';

const EXAMPLE_PROMPTS = [
  'I’m flying from SEA to Las Vegas Friday night and coming back Sunday',
  "I'm heading to Fred Meyer in Monroe",
  'Weekend trip from Monroe to SeaTac, Nov 15 to Nov 18',
  'Need parking at LAX for 4 days',
];

type TripAssistantPanelProps = {
  className?: string;
};

type ParseTripApiResponse = ParsedTripAssistantResult & {
  liveProviderActive?: boolean;
  configuredProvider?: 'mock' | 'openai';
  providerUsed?: 'mock' | 'openai';
  assistantLabel?: string;
  requiresConfirmation?: boolean;
};

export default function TripAssistantPanel({ className = '' }: TripAssistantPanelProps) {
  const router = useRouter();
  const { session, user, loading: authLoading } = useAuth();
  const [userText, setUserText] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [liveProviderActive, setLiveProviderActive] = useState(false);
  const [configuredProvider, setConfiguredProvider] = useState<'mock' | 'openai'>('mock');
  const [confirmed, setConfirmed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [parseTurns, setParseTurns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(
    () => `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const accessToken = session?.access_token ?? null;
  const signedIn = Boolean(user && accessToken);
  const assistantStartedTracked = useRef(false);

  useEffect(() => {
    if (assistantStartedTracked.current) return;
    assistantStartedTracked.current = true;
    trackEvent('ai_assistant_started', { accessToken });
  }, [accessToken]);

  const assistantStatusLabel = useMemo(() => {
    if (!signedIn) return 'Sign in to use AI Trip Planner';
    if (loading) return 'AI parse in progress…';
    if (clarificationQuestions.length > 0) return 'Needs a few details';
    if (parsed) return 'Review before running';
    return liveProviderActive ? 'AI Trip Planner' : 'Mock parser in development';
  }, [signedIn, loading, clarificationQuestions.length, parsed, liveProviderActive]);

  useEffect(() => {
    if (!signedIn || !accessToken) return;

    let cancelled = false;

    fetch('/api/ai/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => response.json())
      .then((data: {
        configuredProvider?: 'mock' | 'openai';
        liveProviderActive?: boolean;
        providerUsed?: 'mock' | 'openai';
      }) => {
        if (cancelled) return;
        setConfiguredProvider(data.configuredProvider === 'openai' ? 'openai' : 'mock');
        setLiveProviderActive(Boolean(data.liveProviderActive || data.providerUsed === 'openai'));
      })
      .catch(() => {
        if (!cancelled) {
          setConfiguredProvider('mock');
          setLiveProviderActive(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, signedIn]);

  const handleParse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmed(false);

    if (!signedIn) {
      setParsed(null);
      setClarificationQuestions([]);
      setError('Sign in to use AI Trip Planner.');
      return;
    }

    setLoading(true);

    try {
      const nextTurns = [...parseTurns, userText.trim()].filter(Boolean);
      const combinedUserText = nextTurns.join('\n');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/ai/parse-trip', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userText: combinedUserText, sessionId }),
      });

      const data = (await response.json()) as ParseTripApiResponse & { message?: string };
      if (!response.ok) {
        throw new Error(data.message || 'Could not parse trip.');
      }

      setLiveProviderActive(Boolean(data.liveProviderActive || data.providerUsed === 'openai'));
      setConfiguredProvider(data.configuredProvider === 'openai' ? 'openai' : 'mock');
      if (data.status === 'needs_clarification') {
        setParsed(null);
        setParseTurns(nextTurns);
        setClarificationQuestions(data.clarificationQuestions || []);
        setUserText('');
      } else {
        setParsed(data);
        setParseTurns([]);
        setClarificationQuestions([]);
      }
      trackEvent('ai_assistant_submitted', {
        accessToken,
        eventProperties: {
          configuredProvider: data.configuredProvider === 'openai' ? 'openai' : 'mock',
          liveProviderActive: Boolean(data.liveProviderActive),
          confirmed: false,
        },
      });
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
      setError(
        parsed.mode === 'quick_go'
          ? 'Please add a destination and starting point (or use current location) before continuing.'
          : 'Please fill origin, airport, and departure date before continuing.',
      );
      return;
    }

    setConfirmed(true);
    trackEvent('ai_assistant_submitted', {
      accessToken,
      eventProperties: {
        configuredProvider,
        liveProviderActive,
        confirmed: true,
        airportCode: parsed.airportCode ?? undefined,
      },
    });
    router.push(buildResultsPathFromSearchParams(params));
  };

  const handleCancel = () => {
    setParsed(null);
    setConfirmed(false);
    setParseTurns([]);
    setClarificationQuestions([]);
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
            <button
              type="button"
              onClick={() => setShowInfo((current) => !current)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-muted-foreground"
              title="AI planning is available for signed-in users."
              aria-label="AI Trip Planner info"
            >
              ?
            </button>
          </div>
          {showInfo ? (
            <div className="mb-2 max-w-md rounded-xl border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground shadow-sm">
              AI planning is available for signed-in users. Register or sign in to use Ask
              PodPaiGo and save your trip context.
              Describe your trip. PodPaiGo will ask follow-up questions, then fill the planner for review.
            </div>
          ) : null}
          <h2 className="text-xl font-bold text-foreground">Describe a trip or destination</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use it for airport trips or quick point A to B plans.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <StatusPill tone="primary">{assistantStatusLabel}</StatusPill>
          <span className="text-xs text-muted-foreground">
            {signedIn
              ? liveProviderActive
                ? 'AI Trip Planner'
                : 'Mock parser in development'
              : 'Register or sign in first'}
          </span>
        </div>
      </div>

      {!authLoading && !signedIn ? (
        <div className="relative mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">Sign in to use AI Trip Planner</p>
          <p className="mt-1 text-muted-foreground">
            Ask PodPaiGo can explain routes, parking, timing, and tradeoffs using your trip
            results.
          </p>
          <Link
            href="/login?redirect=/%23assistant"
            className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Register or sign in
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleParse} className="relative mt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          Trip description
          <textarea
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            disabled={!signedIn || authLoading}
            rows={4}
            placeholder={
              clarificationQuestions.length > 0
                ? 'Answer the follow-up questions here.'
                : 'I am going to Pike Place Market tomorrow. Plan commute for me.'
            }
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

        {clarificationQuestions.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
            <p className="font-semibold">A few details needed</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {clarificationQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!userText.trim() || loading || !signedIn || authLoading}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/10 transition hover:from-sky-500 hover:to-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 dark:from-sky-500 dark:to-blue-600 dark:hover:from-sky-400 dark:hover:to-blue-500"
        >
          {loading
            ? 'AI parse…'
            : clarificationQuestions.length > 0
              ? 'Continue'
              : 'Generate trip plan'}
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
