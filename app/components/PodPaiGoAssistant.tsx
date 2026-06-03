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
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [assistantLabel, setAssistantLabel] = useState('Basic assistant');
  const [messages, setMessages] = useState<ChatMessage[]>([
    createMessage(
      'assistant',
      page === 'results'
        ? 'Ask about leave time, parking, TSA, or weather on this page. I only use the recommendation data already loaded here.'
        : 'Describe an airport trip and I will parse it for review before recommendations run.',
    ),
  ]);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedTripAssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(
    () => `assistant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    let cancelled = false;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    fetch('/api/ai/status', { headers })
      .then((response) => response.json())
      .then((data: { disabled?: boolean; assistantLabel?: string }) => {
        if (cancelled) return;
        setDisabled(Boolean(data.disabled));
        if (data.assistantLabel) {
          setAssistantLabel(data.assistantLabel);
        }
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
    if (loading) return 'Thinking…';
    return assistantLabel;
  }, [disabled, loading, assistantLabel]);

  if (disabled) {
    return null;
  }

  const appendMessage = (message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  };

  const handleTripParse = async (userText: string) => {
    setLoading(true);
    setError(null);
    setParsed(null);

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

      const data = (await response.json()) as ParseTripApiResponse;
      if (!response.ok) {
        throw new Error(data.message || 'Could not parse trip.');
      }

      setParsed(data);
      if (data.assistantLabel) {
        setAssistantLabel(data.assistantLabel);
      }
      appendMessage(
        createMessage(
          'assistant',
          'I parsed your trip. Review the details below and confirm before recommendations run.',
        ),
      );
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
      setError('Please fill origin, airport, and departure date before continuing.');
      return;
    }

    router.push(buildResultsPathFromSearchParams(params));
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] hover:bg-blue-700 sm:right-6"
        aria-label="Ask PodPaiGo"
      >
        <span aria-hidden="true">💬</span>
        Ask PodPaiGo
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/30 p-0 sm:p-4">
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
                rows={2}
                placeholder={
                  page === 'results'
                    ? 'Ask about leave time, parking, TSA, or weather…'
                    : 'Describe your airport trip…'
                }
                className="w-full resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <TripAssistantVoiceButton
                  disabled={loading}
                  onTranscript={(transcript) => {
                    setInput(transcript);
                    void handleSend(transcript);
                  }}
                />

                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Trip planning always shows a review step first. No Google Places, Routes, or paid
                speech APIs are used in this assistant.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
