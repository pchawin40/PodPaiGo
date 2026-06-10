'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '../../lib/analytics/trackEvent';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import { resolveTripPlannerStatusLabel, shouldShowDevMockProviderNote } from '../../lib/ai/tripPlanningAssistantLabel';
import {
  buildMultiIntentTurn,
  buildTripPlanningTurn,
  getNextMissingField,
  getTripPlanningPlaceholder,
  isOriginConfirmationPatch,
  reprocessParsedTrip,
  shouldAppendPlanningTurn,
  type TripPlanningQuickReply,
  type TripPlanningTurn,
} from '../../lib/ai/tripPlanningConversation';
import { tripIntentToCard } from '../../lib/ai/tripIntents';
import type { TripIntent } from '../../lib/ai/tripIntentTypes';
import { getRecentOrigins } from '../../lib/trip/quickGo';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import { useAuth } from './AuthProvider';
import TripAssistantChatThread, {
  createTripChatMessage,
  type TripAssistantChatMessage,
  type TripPlanningEditingField,
} from './TripAssistantChat';
import { useTripPlanningLocation } from './useTripPlanningLocation';
import StatusPill from './ui/StatusPill';

const EXAMPLE_PROMPTS = [
  "I'm flying from SEA to Las Vegas Friday night and coming back Sunday",
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
  intents?: TripIntent[];
  originalText?: string;
  primaryIntentId?: string | null;
};

export default function TripAssistantPanel({ className = '' }: TripAssistantPanelProps) {
  const router = useRouter();
  const { session, user, loading: authLoading } = useAuth();
  const locationContext = useTripPlanningLocation();
  const [userText, setUserText] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [rawParsed, setRawParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [messages, setMessages] = useState<TripAssistantChatMessage[]>([]);
  const [liveProviderActive, setLiveProviderActive] = useState(false);
  const [configuredProvider, setConfiguredProvider] = useState<'mock' | 'openai'>('mock');
  const [confirmed, setConfirmed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [originInputMode, setOriginInputMode] = useState(false);
  const [originInputReason, setOriginInputReason] = useState<'reject' | 'change' | 'default'>('default');
  const [editingField, setEditingField] = useState<TripPlanningEditingField | null>(null);
  const [showRecentOriginPicker, setShowRecentOriginPicker] = useState(false);
  const [originBackup, setOriginBackup] = useState<{
    originText: ParsedTripAssistantResult['originText'];
    originSource: ParsedTripAssistantResult['originSource'];
  } | null>(null);
  const [extractedIntents, setExtractedIntents] = useState<TripIntent[]>([]);
  const [suggestedOrigin, setSuggestedOrigin] = useState<string | null>(null);
  const [parseTurns, setParseTurns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(
    () => `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const chatRef = useRef<HTMLDivElement | null>(null);
  const lastPlanningTurnRef = useRef<TripPlanningTurn | null>(null);
  const lastParsedRef = useRef<ParsedTripAssistantResult | null>(null);
  const pendingTransitionRef = useRef(false);

  const accessToken = session?.access_token ?? null;
  const signedIn = Boolean(user && accessToken);
  const assistantStartedTracked = useRef(false);
  const planningTurn = useMemo(() => {
    if (!rawParsed) return null;
    return buildTripPlanningTurn(rawParsed, locationContext, {
      originInputMode,
      originInputReason,
      suggestedOrigin,
    });
  }, [rawParsed, locationContext, originInputMode, originInputReason, suggestedOrigin]);

  const inputPlaceholder = useMemo(() => {
    if (!planningTurn) {
      return 'Describe a trip or destination…';
    }

    return getTripPlanningPlaceholder({
      phase: planningTurn.phase,
      nextField: planningTurn.nextField,
      status: planningTurn.status,
      originInputMode,
      editingField,
    });
  }, [planningTurn, originInputMode, editingField]);

  useEffect(() => {
    if (assistantStartedTracked.current) return;
    assistantStartedTracked.current = true;
    trackEvent('ai_assistant_started', { accessToken });
  }, [accessToken]);

  const assistantStatusLabel = useMemo(() => {
    if (!signedIn) return 'Sign in to use AI Trip Planner';
    if (loading) return 'AI parse in progress…';
    if (planningTurn?.status === 'needs_clarification') return planningTurn.headline;
    if (parsed) return 'Review before running';
    return resolveTripPlannerStatusLabel({
      liveProviderActive,
      providerUsed: configuredProvider,
    });
  }, [signedIn, loading, planningTurn, parsed, liveProviderActive, configuredProvider]);

  useEffect(() => {
    const container = chatRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, parsed, loading]);

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

  const appendMessage = (message: TripAssistantChatMessage) => {
    setMessages((current) => [...current, message]);
  };

  const updateReadyTurnInPlace = (processed: ParsedTripAssistantResult) => {
    const turn = buildTripPlanningTurn(processed, locationContext);
    setRawParsed(processed);
    setParsed(processed);
    lastPlanningTurnRef.current = turn;
    lastParsedRef.current = processed;
    setMessages((current) => {
      const next = [...current];
      for (let index = next.length - 1; index >= 0; index -= 1) {
        const message = next[index];
        if (message.role === 'assistant' && message.turn?.phase === 'ready_to_plan') {
          next[index] = {
            ...message,
            turn,
            text: turn.acknowledgment,
          };
          break;
        }
      }
      return next;
    });
  };

  const saveFieldPatch = (patch: Partial<ParsedTripAssistantResult>) => {
    if (!rawParsed) return;
    const processed = reprocessParsedTrip(rawParsed, patch);
    if (processed.status === 'ready_for_review') {
      updateReadyTurnInPlace(processed);
      return;
    }
    applyLocalTripState(rawParsed, patch);
  };

  const appendPlanningTurn = (
    turn: TripPlanningTurn,
    processed: ParsedTripAssistantResult,
    options?: { force?: boolean },
  ) => {
    if (
      !options?.force &&
      !shouldAppendPlanningTurn(
        lastPlanningTurnRef.current,
        turn,
        lastParsedRef.current,
        processed,
      )
    ) {
      return false;
    }

    lastPlanningTurnRef.current = turn;
    lastParsedRef.current = processed;
    appendMessage(createTripChatMessage('assistant', turn.acknowledgment, turn));
    return true;
  };

  const applyLocalTripState = (
    base: ParsedTripAssistantResult,
    patch: Partial<ParsedTripAssistantResult> = {},
    options?: {
      originInputMode?: boolean;
      originInputReason?: 'reject' | 'change' | 'default';
      appendUserLabel?: string;
      forceTurn?: boolean;
    },
  ) => {
    const processed = reprocessParsedTrip(base, patch);
    const nextOriginInputMode = options?.originInputMode ?? originInputMode;
    const nextOriginInputReason = options?.originInputReason ?? originInputReason;
    const turn = buildTripPlanningTurn(processed, locationContext, {
      originInputMode: nextOriginInputMode,
      originInputReason: nextOriginInputReason,
      suggestedOrigin,
    });

    setRawParsed(processed);
    setOriginInputMode(nextOriginInputMode);
    setOriginInputReason(nextOriginInputReason);
    setShowRecentOriginPicker(false);

    if (options?.appendUserLabel) {
      appendMessage(createTripChatMessage('user', options.appendUserLabel));
    }

    if (turn.status === 'ready_for_review') {
      setParsed(processed);
      setOriginInputMode(false);
      setOriginInputReason('default');
      appendPlanningTurn(turn, processed, { force: options?.forceTurn });
      return processed;
    }

    setParsed(null);
    appendPlanningTurn(turn, processed, { force: options?.forceTurn });
    return processed;
  };

  const applyMultiIntentResponse = (intents: TripIntent[]) => {
    setExtractedIntents(intents);
    setRawParsed(null);
    setParsed(null);
    setOriginInputMode(false);
    setOriginInputReason('default');
    setEditingField(null);
    setShowRecentOriginPicker(false);

    const turn = buildMultiIntentTurn(intents.map(tripIntentToCard));
    lastPlanningTurnRef.current = turn;
    lastParsedRef.current = null;
    appendMessage(createTripChatMessage('assistant', turn.acknowledgment, turn));
  };

  const startSingleIntent = (parsedResult: ParsedTripAssistantResult) => {
    const processed = reprocessParsedTrip(parsedResult);
    const turn = buildTripPlanningTurn(processed, locationContext, { originInputMode: false });

    setRawParsed(processed);
    setSuggestedOrigin(processed.originText ?? null);
    setOriginInputMode(false);
    setOriginInputReason('default');
    setEditingField(null);
    setShowRecentOriginPicker(false);

    if (turn.status === 'ready_for_review') {
      setParsed(processed);
      appendPlanningTurn(turn, processed, { force: true });
    } else {
      setParsed(null);
      appendPlanningTurn(turn, processed, { force: true });
    }
  };

  const applyParsedResponse = (data: ParseTripApiResponse) => {
    if (data.intents && data.intents.length > 1) {
      applyMultiIntentResponse(data.intents);
      return;
    }

    setExtractedIntents([]);
    startSingleIntent(data);
  };

  const handleSelectIntent = (intent: TripIntent) => {
    appendMessage(createTripChatMessage('user', tripIntentToCard(intent).buttonLabel));
    setExtractedIntents([]);
    lastPlanningTurnRef.current = null;
    lastParsedRef.current = null;
    startSingleIntent(intent.parsed);
  };

  const runParse = async (nextTurns: string[]) => {
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
    setParseTurns(nextTurns);
    applyParsedResponse(data);

    trackEvent('ai_assistant_submitted', {
      accessToken,
      eventProperties: {
        configuredProvider: data.configuredProvider === 'openai' ? 'openai' : 'mock',
        liveProviderActive: Boolean(data.liveProviderActive),
        confirmed: false,
      },
    });
  };

  const handleParse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setConfirmed(false);

    if (!signedIn) {
      setParsed(null);
      setRawParsed(null);
      setError('Sign in to use AI Trip Planner.');
      return;
    }

    const trimmed = userText.trim();
    if (!trimmed) return;

    appendMessage(createTripChatMessage('user', trimmed));
    setUserText('');
    setLoading(true);
    setEditingField(null);

    if (originInputMode && rawParsed) {
      applyLocalTripState(rawParsed, {
        originText: trimmed,
        originSource: 'manual',
      }, { originInputMode: false });
      setLoading(false);
      return;
    }

    if (rawParsed && planningTurn?.status === 'needs_clarification') {
      const nextField = getNextMissingField(reprocessParsedTrip(rawParsed));
      if (nextField === 'originText') {
        applyLocalTripState(rawParsed, {
          originText: trimmed,
          originSource: 'manual',
        });
        setLoading(false);
        return;
      }
    }

    if (messages.length === 0) {
      lastPlanningTurnRef.current = null;
      lastParsedRef.current = null;
      setOriginInputMode(false);
    }

    try {
      const nextTurns = [...parseTurns, trimmed].filter(Boolean);
      await runParse(nextTurns);
    } catch (parseError) {
      setParsed(null);
      setRawParsed(null);
      setError(parseError instanceof Error ? parseError.message : 'Could not parse trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickReply = async (reply: TripPlanningQuickReply) => {
    if (loading || pendingTransitionRef.current) return;

    if (reply.action === 'plan_trip') {
      handleConfirm();
      return;
    }

    if (reply.action === 'select_intent') {
      const intent = extractedIntents.find((item) => item.id === reply.intentId);
      if (!intent) return;
      handleSelectIntent(intent);
      return;
    }

    if (reply.action === 'reject_origin_confirmation') {
      if (!rawParsed) return;
      setEditingField(null);
      setOriginBackup(null);
      applyLocalTripState(rawParsed, {}, {
        originInputMode: true,
        originInputReason: 'reject',
        appendUserLabel: reply.label,
      });
      return;
    }

    if (reply.action === 'choose_recent_origin') {
      if (!rawParsed) return;
      const recents = getRecentOrigins();
      if (recents.length === 1) {
        pendingTransitionRef.current = true;
        applyLocalTripState(rawParsed, {
          originText: recents[0],
          originSource: 'manual',
        }, {
          originInputMode: false,
          originInputReason: 'default',
          appendUserLabel: recents[0],
        });
        pendingTransitionRef.current = false;
        return;
      }
      setShowRecentOriginPicker(true);
      appendMessage(createTripChatMessage('user', reply.label));
      return;
    }

    if (reply.action === 'change_start' || reply.action === 'await_origin_input') {
      if (!rawParsed) return;
      setEditingField(null);
      if (reply.action === 'change_start' && rawParsed.status === 'ready_for_review') {
        setOriginBackup({
          originText: rawParsed.originText,
          originSource: rawParsed.originSource,
        });
      } else {
        setOriginBackup(null);
      }
      const originReset =
        reply.action === 'change_start'
          ? { originText: null, originSource: 'unknown' as const }
          : {};
      applyLocalTripState(rawParsed, originReset, {
        originInputMode: true,
        originInputReason: 'change',
        appendUserLabel: reply.label,
      });
      return;
    }

    if (reply.action === 'back_from_origin_input') {
      if (!rawParsed) return;
      const restorePatch = originBackup ?? {};
      applyLocalTripState(rawParsed, restorePatch, {
        originInputMode: false,
        originInputReason: 'default',
        appendUserLabel: reply.label,
      });
      setOriginBackup(null);
      return;
    }

    if (reply.patch && rawParsed) {
      if (
        isOriginConfirmationPatch(reply.patch) &&
        rawParsed.originSource === 'current_location' &&
        rawParsed.status === 'ready_for_review'
      ) {
        return;
      }

      pendingTransitionRef.current = true;
      applyLocalTripState(rawParsed, reply.patch, { appendUserLabel: reply.label });
      pendingTransitionRef.current = false;
      return;
    }

    if (reply.value.endsWith(' ')) {
      setUserText(reply.value);
      return;
    }

    if (!reply.value.trim()) {
      return;
    }

    appendMessage(createTripChatMessage('user', reply.label));
    setLoading(true);
    setError(null);

    try {
      const nextTurns = [...parseTurns, reply.value].filter(Boolean);
      await runParse(nextTurns);
    } catch (parseError) {
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
              Describe your trip. PodPaiGo will ask one follow-up at a time, then fill the planner for review.
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
              ? resolveTripPlannerStatusLabel({
                  liveProviderActive,
                  providerUsed: configuredProvider,
                })
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

      {messages.length > 0 ? (
        <div ref={chatRef} className="relative mt-4 max-h-80 overflow-y-auto pr-1">
          <TripAssistantChatThread
            messages={messages}
            loading={loading}
            parsed={parsed}
            context={locationContext}
            onQuickReply={(reply) => {
              void handleQuickReply(reply);
            }}
            onFieldPatch={saveFieldPatch}
            onPlanTrip={handleConfirm}
            onEditingFieldChange={setEditingField}
          />
        </div>
      ) : null}

      <form onSubmit={handleParse} className="relative mt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">
          {messages.length > 0 ? 'Your reply' : 'Trip description'}
          <textarea
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            disabled={!signedIn || authLoading || loading}
            rows={messages.length > 0 ? 2 : 4}
            placeholder={inputPlaceholder}
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 dark:bg-muted/70"
          />
        </label>

        {messages.length === 0 ? (
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
        ) : null}

        {error ? (
          <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!userText.trim() || loading || !signedIn || authLoading}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/10 transition hover:from-sky-500 hover:to-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 dark:from-sky-500 dark:to-blue-600 dark:hover:from-sky-400 dark:hover:to-blue-500"
          >
            {loading ? 'Working…' : messages.length > 0 ? 'Send' : 'Start planning'}
          </button>

        </div>
      </form>

      {showRecentOriginPicker ? (
        <div className="relative mt-3 flex flex-wrap gap-2">
          {getRecentOrigins().map((origin) => (
            <button
              key={origin}
              type="button"
              onClick={() => {
                if (!rawParsed) return;
                applyLocalTripState(rawParsed, {
                  originText: origin,
                  originSource: 'manual',
                }, {
                  originInputMode: false,
                  originInputReason: 'default',
                  appendUserLabel: origin,
                });
              }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium"
            >
              {origin}
            </button>
          ))}
        </div>
      ) : null}

      {parsed && !confirmed && shouldShowDevMockProviderNote({
        liveProviderActive,
        providerUsed: configuredProvider,
      }) ? (
        <p className="relative mt-3 text-xs text-muted-foreground">
          Review before running. Provider: {parsed.parser}
          {configuredProvider === 'openai' ? ' (live configured)' : ' (mock/dev fallback)'}.
        </p>
      ) : null}
    </section>
  );
}
