import type { AdminUser } from '@/lib/auth/admin';

export type OutreachTemplateId = 'blank' | 'spothero-partner' | 'parkwhiz-partner' | 'apr-partner';

export type OutreachTemplate = {
  id: OutreachTemplateId;
  label: string;
  subject: string;
  body: string;
};

export type OutreachDefaults = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  testRecipient: string | null;
};

export type OutreachSendInput = {
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
  replyTo?: unknown;
  templateId?: unknown;
  testMode?: unknown;
};

export type OutreachValidationResult =
  | {
      ok: true;
      email: {
        to: string;
        originalTo: string;
        subject: string;
        body: string;
        fromName: string;
        fromEmail: string;
        replyTo: string;
        templateId: OutreachTemplateId;
        testMode: boolean;
      };
    }
  | {
      ok: false;
      error: string;
      message: string;
    };

export type ResendEmailResult = {
  id: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 160;
const MAX_BODY_LENGTH = 6000;
const MAX_NAME_LENGTH = 80;

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
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
    body: [
      'Hi SpotHero team,',
      '',
      'My name is Ham, and I am building PodPaiGo, a public-beta trip planning app that helps travelers compare airport parking, city parking, rideshare, transit, route timing, weather, and parking rules before they leave.',
      '',
      'PodPaiGo is pre-launch/beta right now, and I am preparing partner-safe provider links before wider outreach. I would like to understand the right way to send parking referrals to SpotHero with proper tracking and attribution.',
      '',
      'Could you point me to the correct partner or affiliate approval process, plus any Parking Link Routing or deep-link documentation?',
      '',
      'A few specific questions:',
      '',
      '- Which tracking/referral parameters should PodPaiGo use for approved SpotHero links?',
      '- Do your deep links support location, airport, venue, event, and date/time context?',
      '- Is there a recommended pattern for airport parking vs city garages vs event/stadium parking?',
      '- Are there brand, disclosure, or compliance requirements I should follow in the app?',
      '',
      'I can share screenshots, a demo link, and example search flows if helpful.',
      '',
      'Thanks,',
      'Ham',
      'PodPaiGo',
    ].join('\n'),
  },
  {
    id: 'parkwhiz-partner',
    label: 'ParkWhiz partner outreach',
    subject: 'Partner tracking for PodPaiGo parking referrals',
    body: [
      'Hi ParkWhiz team,',
      '',
      'My name is Ham, and I am building PodPaiGo, a public-beta trip planning app that compares airport parking, city parking, rideshare, transit, route timing, weather, and parking rules.',
      '',
      'PodPaiGo already treats provider pricing and booking links carefully, and I would like to make sure ParkWhiz referrals use the correct partner tracking and deep-link patterns before wider beta outreach.',
      '',
      'Could you share the correct affiliate or partner approval process, tracking parameters, and any guidance for airport, city, or event parking links?',
      '',
      'I can send screenshots, a demo link, and example flows if useful.',
      '',
      'Thanks,',
      'Ham',
      'PodPaiGo',
    ].join('\n'),
  },
  {
    id: 'apr-partner',
    label: 'APR affiliate outreach',
    subject: 'Affiliate tracking for PodPaiGo airport parking referrals',
    body: [
      'Hi AirportParkingReservations team,',
      '',
      'My name is Ham, and I am building PodPaiGo, a public-beta trip planning app for airport access and parking decisions.',
      '',
      'PodPaiGo can surface AirportParkingReservations links for airport parking, while clearly labeling cached/from pricing and asking users to confirm final price and availability with the provider.',
      '',
      'Could you share the correct affiliate approval process, tracking/referral parameters, and any recommended deep-link format for airport parking searches?',
      '',
      'I can provide screenshots, a demo link, and example airport trip flows if helpful.',
      '',
      'Thanks,',
      'Ham',
      'PodPaiGo',
    ].join('\n'),
  },
];

export function getOutreachDefaults(env: NodeJS.ProcessEnv = process.env): OutreachDefaults {
  return {
    fromName: env.OUTREACH_FROM_NAME?.trim() || 'Ham from PodPaiGo',
    fromEmail: env.OUTREACH_FROM_EMAIL?.trim() || 'hello@podpaigo.com',
    replyTo: env.OUTREACH_REPLY_TO?.trim() || 'p.chawin40@gmail.com',
    testRecipient: env.OUTREACH_TEST_RECIPIENT?.trim() || null,
  };
}

export function getOutreachTemplate(id: string | null | undefined): OutreachTemplate {
  return OUTREACH_TEMPLATES.find((template) => template.id === id) ?? OUTREACH_TEMPLATES[0];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= 254;
}

function normalizeName(value: unknown, fallback: string): string {
  const trimmed = asString(value);
  return (trimmed || fallback).slice(0, MAX_NAME_LENGTH);
}

export function formatResendFrom(name: string, email: string): string {
  const safeName = name.replace(/[<>\r\n"]/g, '').trim();
  return safeName ? `${safeName} <${email}>` : email;
}

export function validateOutreachSendInput(
  input: OutreachSendInput,
  admin: AdminUser,
  env: NodeJS.ProcessEnv = process.env,
): OutreachValidationResult {
  const defaults = getOutreachDefaults(env);
  const originalTo = asString(input.to);
  const testMode = input.testMode === true;
  const to = testMode ? defaults.testRecipient || admin.email || '' : originalTo;
  const subject = asString(input.subject);
  const body = asString(input.body);
  const fromName = normalizeName(input.fromName, defaults.fromName);
  const fromEmail = asString(input.fromEmail) || defaults.fromEmail;
  const replyTo = asString(input.replyTo) || defaults.replyTo;
  const template = getOutreachTemplate(asString(input.templateId));

  if (!isValidEmail(to)) {
    return {
      ok: false,
      error: 'invalid_recipient',
      message: testMode
        ? 'Test send needs a valid admin email or OUTREACH_TEST_RECIPIENT.'
        : 'Enter one valid recipient email.',
    };
  }

  if (!isValidEmail(fromEmail)) {
    return {
      ok: false,
      error: 'invalid_from_email',
      message: 'Enter a valid From email.',
    };
  }

  if (!isValidEmail(replyTo)) {
    return {
      ok: false,
      error: 'invalid_reply_to',
      message: 'Enter a valid Reply-To email.',
    };
  }

  if (!subject) {
    return { ok: false, error: 'empty_subject', message: 'Subject is required.' };
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      error: 'subject_too_long',
      message: `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`,
    };
  }

  if (!body) {
    return { ok: false, error: 'empty_body', message: 'Body is required.' };
  }

  if (body.length > MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: 'body_too_long',
      message: `Body must be ${MAX_BODY_LENGTH} characters or fewer.`,
    };
  }

  return {
    ok: true,
    email: {
      to,
      originalTo,
      subject,
      body,
      fromName,
      fromEmail,
      replyTo,
      templateId: template.id,
      testMode,
    },
  };
}

export async function sendOutreachEmailWithResend(args: {
  apiKey: string;
  to: string;
  subject: string;
  body: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}): Promise<ResendEmailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: formatResendFrom(args.fromName, args.fromEmail),
      to: [args.to],
      subject: args.subject,
      text: args.body,
      reply_to: args.replyTo,
    }),
  });

  const responseText = await response.text().catch(() => '');
  const parsed = responseText
    ? (() => {
        try {
          return JSON.parse(responseText) as { id?: string };
        } catch {
          return {};
        }
      })()
    : {};

  if (!response.ok) {
    throw new Error(`Resend outreach email failed ${response.status}: ${responseText.slice(0, 200)}`);
  }

  return { id: typeof parsed.id === 'string' ? parsed.id : null };
}

export function recipientDomain(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return domain || null;
}
