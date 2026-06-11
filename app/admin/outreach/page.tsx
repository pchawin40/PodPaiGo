'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import SiteHeader from '../../components/SiteHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TravelCard from '../../components/ui/TravelCard';
import { useAdminStatus } from '../../components/useAdminStatus';
import AdminNav from '../AdminNav';
import type {
  OutreachDefaults,
  OutreachTemplate,
  OutreachTemplateId,
} from '../../../lib/admin/outreachEmail';

type OutreachConfigResponse = {
  defaults: OutreachDefaults;
  templates: OutreachTemplate[];
  resendConfigured: boolean;
};

type SendResponse = {
  ok?: boolean;
  sent?: boolean;
  message?: string;
  error?: string;
  testMode?: boolean;
  to?: string;
  messageId?: string | null;
};

const fallbackDefaults: OutreachDefaults = {
  fromName: 'Ham from PodPaiGo',
  fromEmail: 'hello@podpaigo.com',
  replyTo: 'p.chawin40@gmail.com',
  testRecipient: null,
};

const fallbackTemplates: OutreachTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    subject: '',
    body: '',
  },
  {
    id: 'spothero-partner',
    label: 'SpotHero partner outreach',
    subject: 'Partner / deep-link tracking for PodPaiGo parking referrals',
    body: '',
  },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-semibold text-foreground">{children}</label>;
}

export default function AdminOutreachPage() {
  const { accessToken, isAdmin, loading: adminLoading } = useAdminStatus();
  const [defaults, setDefaults] = useState<OutreachDefaults>(fallbackDefaults);
  const [templates, setTemplates] = useState<OutreachTemplate[]>(fallbackTemplates);
  const [resendConfigured, setResendConfigured] = useState(false);
  const [templateId, setTemplateId] = useState<OutreachTemplateId>('spothero-partner');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('Partner / deep-link tracking for PodPaiGo parking referrals');
  const [fromName, setFromName] = useState(fallbackDefaults.fromName);
  const [fromEmail, setFromEmail] = useState(fallbackDefaults.fromEmail);
  const [replyTo, setReplyTo] = useState(fallbackDefaults.replyTo);
  const [body, setBody] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) || templates[0],
    [templateId, templates],
  );

  const loadConfig = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingConfig(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/outreach-email', {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = (await response.json().catch(() => null)) as OutreachConfigResponse | null;
      if (!response.ok || !data) {
        throw new Error('Could not load outreach defaults.');
      }

      setDefaults(data.defaults);
      setTemplates(data.templates);
      setResendConfigured(Boolean(data.resendConfigured));
      setFromName(data.defaults.fromName);
      setFromEmail(data.defaults.fromEmail);
      setReplyTo(data.defaults.replyTo);

      const spotHeroTemplate = data.templates.find((template) => template.id === 'spothero-partner');
      if (spotHeroTemplate) {
        setTemplateId(spotHeroTemplate.id);
        setSubject(spotHeroTemplate.subject);
        setBody(spotHeroTemplate.body);
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not load outreach defaults.',
      });
    } finally {
      setLoadingConfig(false);
    }
  }, [accessToken, isAdmin]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      void loadConfig();
    }
  }, [adminLoading, isAdmin, loadConfig]);

  function applyTemplate(nextTemplateId: OutreachTemplateId) {
    const template = templates.find((item) => item.id === nextTemplateId);
    setTemplateId(nextTemplateId);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
  }

  async function sendEmail(testMode: boolean) {
    if (!isAdmin) return;
    setSending(true);
    setStatus({ tone: 'info', message: testMode ? 'Sending test email...' : 'Sending email...' });

    try {
      const response = await fetch('/api/admin/outreach-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          to,
          subject,
          body,
          fromName,
          fromEmail,
          replyTo,
          templateId,
          testMode,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as SendResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || data.error || `Send failed (${response.status})`);
      }

      setStatus({
        tone: 'success',
        message: testMode
          ? `Test email sent to ${data.to}.`
          : `Email sent to ${data.to}.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Email could not be sent.',
      });
    } finally {
      setSending(false);
    }
  }

  const statusClass =
    status?.tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status?.tone === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/account" className="text-sm font-medium text-primary hover:underline">
          ← Account
        </Link>
        <AdminNav className="mt-6" />

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Admin outreach
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Partner email composer
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Send one-off PodPaiGo partner outreach emails through Resend. This page is admin-only,
            plain text only, and separate from public feedback notifications.
          </p>
        </div>

        {status ? (
          <div className={`mt-6 rounded-2xl border p-4 text-sm ${statusClass}`}>
            {status.message}
          </div>
        ) : null}

        {!resendConfigured && !loadingConfig ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            RESEND_API_KEY is not configured. You can draft and preview, but sends will fail until
            the server env var is set.
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <TravelCard className="min-w-0">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel>Template</FieldLabel>
                <select
                  value={templateId}
                  onChange={(event) => applyTemplate(event.target.value as OutreachTemplateId)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <FieldLabel>To</FieldLabel>
                <input
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="partner@example.com"
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="grid gap-2">
                <FieldLabel>Subject</FieldLabel>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel>From name</FieldLabel>
                  <input
                    value={fromName}
                    onChange={(event) => setFromName(event.target.value)}
                    className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel>From email</FieldLabel>
                  <input
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                    className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <FieldLabel>Reply-To</FieldLabel>
                <input
                  value={replyTo}
                  onChange={(event) => setReplyTo(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>

              <div className="grid gap-2">
                <FieldLabel>Body</FieldLabel>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={20}
                  className="min-h-[28rem] resize-y rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm leading-6 text-foreground"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  disabled={sending || loadingConfig}
                  onClick={() => void sendEmail(true)}
                >
                  Send test to myself
                </PrimaryButton>
                <PrimaryButton
                  type="button"
                  disabled={sending || loadingConfig}
                  onClick={() => void sendEmail(false)}
                >
                  Send email
                </PrimaryButton>
              </div>
            </div>
          </TravelCard>

          <TravelCard className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">Preview</h2>
            <div className="mt-4 space-y-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="font-semibold text-foreground">From: </span>
                <span className="text-muted-foreground">
                  {fromName || defaults.fromName} &lt;{fromEmail || defaults.fromEmail}&gt;
                </span>
              </div>
              <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="font-semibold text-foreground">Reply-To: </span>
                <span className="text-muted-foreground">{replyTo || defaults.replyTo}</span>
              </div>
              <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="font-semibold text-foreground">To: </span>
                <span className="text-muted-foreground">{to || 'partner@example.com'}</span>
              </div>
              <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="font-semibold text-foreground">Subject: </span>
                <span className="text-muted-foreground">{subject || selectedTemplate?.subject || 'Untitled'}</span>
              </div>
            </div>
            <pre
              data-testid="outreach-email-preview-body"
              className="mt-4 max-h-[36rem] min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-slate-950 p-4 font-sans text-sm leading-6 text-slate-100 [overflow-wrap:anywhere]"
            >
              {body || 'Choose a template or write a message.'}
            </pre>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Test sends go to {defaults.testRecipient || 'your signed-in admin email'} instead of
              the partner recipient.
            </p>
          </TravelCard>
        </div>
      </div>
    </main>
  );
}
