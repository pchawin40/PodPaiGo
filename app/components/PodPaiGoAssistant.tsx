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

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

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

function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
  };
}

export default function PodPaiGoAssistant({
  page,
  resultsContext = null,
}: PodPaiGoAssistantProps) {
  const router = useRouter();
  const { session, user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [showFeatureInfo, setShowFeatureInfo] = useState(false);
  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [assistantLabel, setAssistantLabel] = useState('Mock parser in development');
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      'assistant',
      page === 'results'
        ? 'Ask about leave time, parking, TSA, or weather on this page. I only use the recommendation data already loaded here.'
        : 'Describe your trip. I’ll ask follow-up questions, then fill the planner for review before recommendations run.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('');
  const [sessionId] = useState(
    () => `assistant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);

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
          data.liveProviderActive || data.providerUsed === 'openai'
            ? 'AI Trip Planner'
            : 'Mock parser in development',
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

  const appendMessage = (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  };

  const handleTripParse = async (userText: string) => {
    if (!signedIn) {
      appendMessage(
        createMessage(
          'assistant',
          'Sign in to use AI Trip Planner. Ask PodPaiGo can explain routes, parking, timing, and tradeoffs using your trip results.',
        ),
      );
      return;
    }

    setLoading(true);
    setError(null);
      setParsed(null);
      setAwaitingClarification(false);

    try {
      const previousTripInputs = messages
        .filter((message) => message.role === 'user')
        .map((message) => message.text);
      const combinedUserText = [...previousTripInputs, userText].filter(Boolean).join('\n');
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

      if (data.assistantLabel) {
        setAssistantLabel(
          data.liveProviderActive || data.providerUsed === 'openai'
            ? 'AI Trip Planner'
            : 'Mock parser in development',
        );
      }
      if (data.status === 'needs_clarification') {
        setParsed(null);
        setAwaitingClarification(true);
        appendMessage(
          createMessage(
            'assistant',
            (data.clarificationQuestions && data.clarificationQuestions.length > 0
              ? data.clarificationQuestions
              : ['Can you add the missing trip details?']
            ).join(' '),
          ),
        );
      } else {
        setParsed(data);
        setAwaitingClarification(false);
        appendMessage(
          createMessage(
            'assistant',
            'I parsed your trip. Review the details below and confirm before recommendations run.',
          ),
        );
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Could not parse trip.');
      appendMessage(
        createMessage(
          'assistant',
          'I could not parse that trip request. Try including origin, airport code, and dates.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (rawText: string) => {
    const userText = rawText.trim();
    if (!userText || loading) return;

    appendMessage(createMessage('user', userText));
    setInput('');
    setError(null);
    setParsed(null);

    if (!signedIn) {
      appendMessage(
        createMessage(
          'assistant',
          'AI planning is available for signed-in users. Register or sign in to use Ask PodPaiGo and save your trip context.',
        ),
      );
      return;
    }

    if (awaitingClarification) {
      await handleTripParse(userText);
      return;
    }

    if (page === 'results' && resultsContext && !isTripPlanningMessage(userText)) {
      appendMessage(
        createMessage('assistant', buildResultsExplanation(userText, resultsContext)),
      );
      return;
    }

    if (isTripPlanningMessage(userText)) {
      await handleTripParse(userText);
      return;
    }

    appendMessage(createMessage('assistant', buildMockAssistantReply(userText, page)));
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

          <div className="relative flex h-[min(88vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-sky-100 bg-white shadow-2xl sm:rounded-3xl">
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

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-8 rounded-2xl bg-blue-600 px-3 py-2 text-sm text-white'
                      : 'mr-8 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800'
                  }
                >
                  {message.text}
                </div>
              ))}

              {parsed ? (
                <div className="mr-2">
                  <TripAssistantConfirm
                    parsed={parsed}
                    onChange={setParsed}
                    onConfirm={handleConfirmTrip}
                    onCancel={() => setParsed(null)}
                  />
                </div>
              ) : null}

              {loading ? (
                <div className="mr-8 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Working on that…
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
                    : awaitingClarification
                      ? 'Answer the follow-up question…'
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
                  ? 'Trip planning asks follow-up questions when details are missing, then shows a review step first. No Google Places, Routes, or paid speech APIs are used in this assistant.'
                  : 'Sign in to use AI Trip Planner and Ask PodPaiGo with your trip context.'}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
