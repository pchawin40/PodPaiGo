'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ParsedTripAssistantResult } from '../../lib/ai/tripParseTypes';
import {
  buildMockAssistantReply,
  buildResultsExplanation,
  isTripPlanningMessage,
  type AssistantPage,
  type ResultsAssistantContext,
} from '../../lib/ai/assistantChat';
import { parsedTripToSearchParams } from '../../lib/ai/parsedTripToSearchParams';
import { buildResultsPathFromSearchParams } from '../../lib/trip/searchParams';
import { useAuth } from './AuthProvider';
import TripAssistantConfirm from './TripAssistantConfirm';
import TripAssistantVoiceButton from './TripAssistantVoiceButton';
import TripAssistantChatThread, {
  createTripChatMessage,
  type TripAssistantChatMessage,
} from './TripAssistantChat';
import { resolveTripPlannerStatusLabel } from '../../lib/ai/tripPlanningAssistantLabel';
import {
  buildTripPlanningTurn,
  getNextMissingField,
  reprocessParsedTrip,
  shouldAppendPlanningTurn,
  type TripPlanningQuickReply,
  type TripPlanningTurn,
} from '../../lib/ai/tripPlanningConversation';
import { useTripPlanningLocation } from './useTripPlanningLocation';

type PodPaiGoAssistantProps = {
  page: AssistantPage;
  resultsContext?: ResultsAssistantContext | null;
};

type ParseTripApiResponse = ParsedTripAssistantResult & {
  message?: string;
  providerUsed?: 'mock' | 'openai';
  liveProviderActive?: boolean;
  plan?: 'anonymous' | 'free' | 'plus' | 'pro' | 'admin';
  assistantLabel?: string;
  remainingToday?: number | null;
};

export default function PodPaiGoAssistant({
  page,
  resultsContext = null,
}: PodPaiGoAssistantProps) {
  const router = useRouter();
  const { session, user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [showFeatureInfo, setShowFeatureInfo] = useState(false);
  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [assistantLabel, setAssistantLabel] = useState('AI planner beta');
  const [originInputMode, setOriginInputMode] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [originBackup, setOriginBackup] = useState<{
    originText: ParsedTripAssistantResult['originText'];
    originSource: ParsedTripAssistantResult['originSource'];
  } | null>(null);
  const locationContext = useTripPlanningLocation();
  const [messages, setMessages] = useState<TripAssistantChatMessage[]>([
    createTripChatMessage(
      'assistant',
      page === 'results'
        ? 'Ask about leave time, parking, TSA, or weather on this page. I only use the recommendation data already loaded here.'
        : 'Describe your trip. I’ll ask follow-up questions, then fill the planner for review before recommendations run.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [rawParsed, setRawParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [parseTurns, setParseTurns] = useState<string[]>([]);
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('');
  const [sessionId] = useState(
    () => `assistant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const lastPlanningTurnRef = useRef<TripPlanningTurn | null>(null);
  const lastParsedRef = useRef<ParsedTripAssistantResult | null>(null);

  const accessToken = session?.access_token ?? null;
  const signedIn = Boolean(user && accessToken);
  const signInHref = redirectPath
    ? `/login?redirect=${encodeURIComponent(redirectPath)}`
    : '/login';

  useEffect(() => {
    setRedirectPath(window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    fetch('/api/ai/status', { headers })
      .then((response) => response.json())
      .then((data: {
        disabled?: boolean;
        assistantLabel?: string;
        providerUsed?: 'mock' | 'openai';
        liveProviderActive?: boolean;
      }) => {
        if (cancelled) return;
        setDisabled(Boolean(data.disabled));
        setAssistantLabel(
          resolveTripPlannerStatusLabel({
            liveProviderActive: data.liveProviderActive,
            providerUsed: data.providerUsed,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setDisabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages, parsed, loading]);

  const statusLabel = useMemo(() => {
    if (disabled) return 'Assistant disabled';
    if (!signedIn) return 'Sign in to use AI Trip Planner';
    if (loading) return 'Thinking…';
    return assistantLabel;
  }, [disabled, signedIn, loading, assistantLabel]);

  if (disabled) {
    return null;
  }

  const appendMessage = (message: TripAssistantChatMessage) => {
    setMessages((current) => [...current, message]);
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
      reviewMode?: boolean;
      appendUserLabel?: string;
      forceTurn?: boolean;
    },
  ) => {
    const processed = reprocessParsedTrip(base, patch);
    const nextOriginInputMode = options?.originInputMode ?? originInputMode;
    const turn = buildTripPlanningTurn(processed, locationContext, {
      originInputMode: nextOriginInputMode,
      reviewMode: options?.reviewMode ?? showReviewPanel,
    });

    setRawParsed(processed);
    setOriginInputMode(nextOriginInputMode);

    if (options?.appendUserLabel) {
      appendMessage(createTripChatMessage('user', options.appendUserLabel));
    }

    if (turn.status === 'ready_for_review') {
      setParsed(processed);
      setAwaitingClarification(false);
      setOriginInputMode(false);
      appendPlanningTurn(turn, processed, { force: options?.forceTurn });
      return processed;
    }

    setParsed(null);
    setAwaitingClarification(true);
    appendPlanningTurn(turn, processed, { force: options?.forceTurn });
    return processed;
  };

  const applyParsedResponse = (data: ParsedTripAssistantResult, nextTurns: string[]) => {
    const processed = reprocessParsedTrip(data);
    const turn = buildTripPlanningTurn(processed, locationContext, { originInputMode: false });

    setRawParsed(processed);
    setParseTurns(nextTurns);
    setOriginInputMode(false);
    setShowReviewPanel(false);

    if (turn.status === 'ready_for_review') {
      setParsed(processed);
      setAwaitingClarification(false);
      appendPlanningTurn(turn, processed, { force: true });
      return;
    }

    setParsed(null);
    setAwaitingClarification(true);
    appendPlanningTurn(turn, processed, { force: true });
  };

  const runTripParse = async (nextTurns: string[]) => {
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

    const data = (await response.json()) as ParseTripApiResponse;
    if (!response.ok) {
      throw new Error(data.message || 'Could not parse trip.');
    }

    setAssistantLabel(
      resolveTripPlannerStatusLabel({
        liveProviderActive: data.liveProviderActive,
        providerUsed: data.providerUsed,
      }),
    );

    applyParsedResponse(data, nextTurns);
  };

  const handleTripParse = async (userText: string) => {
    if (!signedIn) {
      appendMessage(
        createTripChatMessage(
          'assistant',
          'Sign in to use AI Trip Planner. Ask PodPaiGo can explain routes, parking, timing, and tradeoffs using your trip results.',
        ),
      );
      return;
    }

    setLoading(true);
    setError(null);
    setShowReviewPanel(false);
    setOriginInputMode(false);
    lastPlanningTurnRef.current = null;
    lastParsedRef.current = null;

    try {
      const nextTurns = [...parseTurns, userText].filter(Boolean);
      await runTripParse(nextTurns);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse trip.');
      appendMessage(
        createTripChatMessage(
          'assistant',
          'I could not parse that trip request. Try including origin, airport code, and dates.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQuickReply = async (reply: TripPlanningQuickReply) => {
    if (loading) return;

    if (reply.action === 'plan_trip') {
      handleConfirmTrip();
      return;
    }

    if (reply.action === 'edit_details') {
      setShowReviewPanel(true);
      return;
    }

    if (reply.action === 'change_start' || reply.action === 'await_origin_input') {
      if (!rawParsed) return;
      setShowReviewPanel(false);
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
        appendUserLabel: reply.label,
      });
      return;
    }

    if (reply.action === 'back_from_origin_input') {
      if (!rawParsed) return;
      const restorePatch = originBackup ?? {};
      applyLocalTripState(rawParsed, restorePatch, {
        originInputMode: false,
        appendUserLabel: reply.label,
      });
      setOriginBackup(null);
      return;
    }

    if (reply.patch && rawParsed) {
      applyLocalTripState(rawParsed, reply.patch, { appendUserLabel: reply.label });
      return;
    }

    if (reply.value.endsWith(' ')) {
      setInput(reply.value);
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
      await runTripParse(nextTurns);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse trip.');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (rawText: string) => {
    const userText = rawText.trim();
    if (!userText || loading) return;

    appendMessage(createTripChatMessage('user', userText));
    setInput('');
    setError(null);

    if (!signedIn) {
      appendMessage(
        createTripChatMessage(
          'assistant',
          'AI planning is available for signed-in users. Register or sign in to use Ask PodPaiGo and save your trip context.',
        ),
      );
      return;
    }

    if (originInputMode && rawParsed) {
      applyLocalTripState(rawParsed, {
        originText: userText,
        originSource: 'manual',
      }, { originInputMode: false });
      return;
    }

    if (awaitingClarification && rawParsed) {
      const current = reprocessParsedTrip(rawParsed);
      const nextField = getNextMissingField(current);
      if (nextField === 'originText') {
        applyLocalTripState(rawParsed, {
          originText: userText,
          originSource: 'manual',
        });
        return;
      }
    }

    if (awaitingClarification) {
      await handleTripParse(userText);
      return;
    }

    setParsed(null);
    setRawParsed(null);
    setShowReviewPanel(false);
    setOriginInputMode(false);
    lastPlanningTurnRef.current = null;
    lastParsedRef.current = null;

    if (page === 'results' && resultsContext && !isTripPlanningMessage(userText)) {
      appendMessage(
        createTripChatMessage('assistant', buildResultsExplanation(userText, resultsContext)),
      );
      return;
    }

    if (isTripPlanningMessage(userText)) {
      await handleTripParse(userText);
      return;
    }

    appendMessage(createTripChatMessage('assistant', buildMockAssistantReply(userText, page)));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSend(input);
  };

  const handleConfirmTrip = () => {
    if (!parsed) return;

    const params = parsedTripToSearchParams(parsed, { confirmed: true });
    if (!params) {
      setError('Please fill the required trip details before continuing.');
      return;
    }

    router.push(buildResultsPathFromSearchParams(params));
    setOpen(false);
  };

  return (
    <>
      <div className="pointer-events-none fixed bottom-20 right-4 z-[120] flex items-center gap-2 sm:bottom-5 sm:right-6">
        {showFeatureInfo ? (
          <div
            id="podpaigo-assistant-info-tooltip"
            role="tooltip"
            className="pointer-events-auto absolute bottom-full right-0 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            AI planning is available for signed-in users. Ask PodPaiGo can explain routes,
            parking, timing, and tradeoffs using your trip results. Describe your trip. PodPaiGo
            will ask follow-up questions, then fill the planner for review.
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setShowFeatureInfo(false);
          }}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="Ask PodPaiGo"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Ask PodPaiGo
        </button>
        <button
          type="button"
          onClick={() => setShowFeatureInfo((current) => !current)}
          onMouseEnter={() => setShowFeatureInfo(true)}
          onFocus={() => setShowFeatureInfo(true)}
          onMouseLeave={() => setShowFeatureInfo(false)}
          onBlur={() => setShowFeatureInfo(false)}
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 shadow-lg hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          aria-label="AI Trip Planner info"
          aria-describedby="podpaigo-assistant-info-tooltip"
          title="AI planning is available for signed-in users."
        >
          ?
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-end bg-slate-950/30 p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close assistant"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />

          <div className="relative flex h-[min(88vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-sky-100 bg-white shadow-2xl sm:rounded-3xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sky-100 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">PodPaiGo Assistant</div>
                <div className="text-xs text-slate-500">{statusLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {!authLoading && !signedIn ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-950">
                  <div className="font-semibold">Sign in to use AI Trip Planner</div>
                  <p className="mt-1">
                    AI planning is available for signed-in users. Register or sign in to use Ask
                    PodPaiGo and save your trip context.
                  </p>
                  <a
                    href={signInHref}
                    className="mt-3 inline-flex rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Register or sign in
                  </a>
                </div>
              ) : null}

              <TripAssistantChatThread
                messages={messages}
                loading={loading}
                onQuickReply={(reply) => {
                  void handleQuickReply(reply);
                }}
              />

              {parsed && showReviewPanel ? (
                <div className="mr-2">
                  <TripAssistantConfirm
                    parsed={parsed}
                    onChange={(next) => {
                      const processed = reprocessParsedTrip(next);
                      setParsed(processed);
                      setRawParsed(processed);
                    }}
                    onConfirm={handleConfirmTrip}
                    onCancel={() => setShowReviewPanel(false)}
                  />
                </div>
              ) : null}

            </div>

            {error ? (
              <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="border-t border-sky-100 px-4 py-3">
              <label className="sr-only" htmlFor="podpaigo-assistant-input">
                Message PodPaiGo assistant
              </label>
              <textarea
                id="podpaigo-assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={!signedIn || authLoading}
                rows={2}
                placeholder={
                  page === 'results'
                    ? 'Ask about leave time, parking, TSA, or weather…'
                    : originInputMode
                      ? 'Enter your starting address…'
                      : awaitingClarification
                        ? 'Answer here or tap a quick reply…'
                        : 'Describe your trip…'
                }
                className="w-full resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <TripAssistantVoiceButton
                  disabled={loading || !signedIn}
                  onTranscript={(transcript) => {
                    setInput(transcript);
                    void handleSend(transcript);
                  }}
                />

                {parsed ? (
                  <button
                    type="button"
                    onClick={handleConfirmTrip}
                    className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    Plan Trip
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={!input.trim() || loading || !signedIn || authLoading}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                {signedIn
                  ? 'Trip planning asks one follow-up at a time when details are missing, then shows a review step first. No Google Places, Routes, or paid speech APIs are used in this assistant.'
                  : 'Sign in to use AI Trip Planner and Ask PodPaiGo with your trip context.'}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
