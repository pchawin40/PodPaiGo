'use client';

import { FormEvent, useState } from 'react';
import type { ParkingOption, TripData } from '@/lib/types';
import { trackEvent } from '@/lib/analytics/trackEvent';
import { stripAnalyticsUrlQueryAndHash } from '@/lib/analytics/sanitizeAnalytics';
import { BETA_FEEDBACK_TYPES, type BetaFeedbackType } from '@/lib/feedback/betaFeedback';

const FEEDBACK_LABELS: Record<BetaFeedbackType, string> = {
  wrong_price: 'Wrong price',
  wrong_route_time: 'Wrong route/time',
  parking_lot_issue: 'Parking lot issue',
  review_issue: 'Review issue',
  app_bug: 'App bug',
  other: 'Other',
};

type BetaFeedbackButtonProps = {
  tripData: TripData | null;
  parking?: ParkingOption | null;
  accessToken?: string | null;
};

function providerName(parking?: ParkingOption | null): string | null {
  return parking?.bookingProvider || parking?.sourceName || parking?.providerSource || null;
}

function buildContext(tripData: TripData | null, parking?: ParkingOption | null) {
  return {
    pageUrl: typeof window !== 'undefined' ? stripAnalyticsUrlQueryAndHash(window.location.href) : null,
    pagePath:
      typeof window !== 'undefined'
        ? stripAnalyticsUrlQueryAndHash(
            `${window.location.pathname}${window.location.search}${window.location.hash}`,
          )
        : null,
    resultType: 'recommendation_results',
    tripType: tripData?.type ?? null,
    airportCode: tripData?.airportCode ?? null,
    provider: providerName(parking),
    lotId: parking?.id ?? parking?.providerLotId ?? null,
    lotName: parking?.name ?? null,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };
}

export default function BetaFeedbackButton({
  tripData,
  parking = null,
  accessToken = null,
}: BetaFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<BetaFeedbackType>('wrong_price');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const openModal = () => {
    setOpen(true);
    setSuccess(false);
    setError(null);
    trackEvent('feedback_opened', {
      accessToken,
      eventProperties: {
        reportType: issueType,
        tripType: tripData?.type ?? undefined,
        airportCode: tripData?.airportCode ?? undefined,
        provider: providerName(parking) ?? undefined,
        lotId: parking?.id ?? parking?.providerLotId ?? undefined,
        lotName: parking?.name ?? undefined,
        sourcePage: 'results',
      },
    });
  };

  const closeModal = () => {
    setOpen(false);
    setError(null);
    if (success) {
      setMessage('');
      setEmail('');
      setSuccess(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          issueType,
          message: message.trim(),
          email: email.trim() || null,
          context: buildContext(tripData, parking),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Feedback failed (${response.status})`);
      }

      setSuccess(true);
      trackEvent('feedback_submitted', {
        accessToken,
        eventProperties: {
          reportType: issueType,
          tripType: tripData?.type ?? undefined,
          airportCode: tripData?.airportCode ?? undefined,
          provider: providerName(parking) ?? undefined,
          lotId: parking?.id ?? parking?.providerLotId ?? undefined,
          lotName: parking?.name ?? undefined,
          sourcePage: 'results',
        },
      });
    } catch (submitError) {
      const messageText =
        submitError instanceof Error ? submitError.message : 'Could not send feedback.';
      setError(messageText);
      trackEvent('feedback_failed', {
        accessToken,
        eventProperties: {
          reportType: issueType,
          tripType: tripData?.type ?? undefined,
          airportCode: tripData?.airportCode ?? undefined,
          sourcePage: 'results',
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Send feedback
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="beta-feedback-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="beta-feedback-title" className="text-lg font-semibold text-zinc-900">
                  Send feedback
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Tell us what looked wrong or confusing. Do not include private addresses unless needed.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                Close
              </button>
            </div>

            {success ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                Thanks. Your feedback was sent.
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-3 block rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-900">Issue type</span>
                  <select
                    value={issueType}
                    onChange={(event) => setIssueType(event.target.value as BetaFeedbackType)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                  >
                    {BETA_FEEDBACK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {FEEDBACK_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-zinc-900">Message</span>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                    placeholder="What should we fix?"
                  />
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-zinc-900">Email (optional)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
                    placeholder="you@example.com"
                  />
                </label>

                {error ? <p className="text-sm text-red-700">{error}</p> : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {submitting ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
