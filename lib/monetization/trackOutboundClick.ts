'use client';

import type { OutboundClickPayload } from './outboundClickTypes';

export function trackOutboundClick(payload: OutboundClickPayload, accessToken?: string | null): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  void fetch('/api/monetization/outbound-click', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Navigation must never depend on telemetry.
  });
}

export async function copyTextThenOpenWithTracking(
  text: string,
  url: string,
  tracking?: OutboundClickPayload,
  accessToken?: string | null,
): Promise<void> {
  if (tracking) {
    trackOutboundClick(tracking, accessToken);
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openTrackedUrl(
  url: string,
  tracking?: OutboundClickPayload,
  accessToken?: string | null,
): void {
  if (tracking) {
    trackOutboundClick(tracking, accessToken);
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
