/** @jest-environment node */

import {
  formatFeedbackEmailText,
  sendFeedbackAdminEmailNotification,
} from '../feedbackEmail';
import type { BetaFeedbackPayload } from '../betaFeedback';

const payload: BetaFeedbackPayload = {
  issueType: 'wrong_price',
  message: 'Provider checkout showed a different price.',
  email: 'beta@example.com',
  context: {
    pageUrl: 'https://podpaigo.test/results?origin=123%20Main%20St#details',
    pagePath: '/results',
    resultType: 'recommendation_results',
    tripType: 'general-trip',
    airportCode: 'SEA',
    provider: 'ParkWhiz',
    lotId: 'lot-1',
    lotName: 'Public Garage',
    timestamp: '2026-06-09T19:30:00.000Z',
    userAgent: 'Jest Browser',
  },
};

describe('feedback email notifications', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats feedback email text with sanitized context', () => {
    const text = formatFeedbackEmailText(payload);

    expect(text).toContain('Issue type: wrong_price');
    expect(text).toContain('Provider checkout showed a different price.');
    expect(text).toContain('User submitted email: beta@example.com');
    expect(text).toContain('Page URL: https://podpaigo.test/results');
    expect(text).toContain('Result type: recommendation_results');
    expect(text).toContain('Trip type: general-trip');
    expect(text).toContain('Provider: ParkWhiz');
    expect(text).toContain('Lot: Public Garage (lot-1)');
    expect(text).toContain('Timestamp: 2026-06-09T19:30:00.000Z');
    expect(text).toContain('User agent: Jest Browser');
    expect(text).not.toContain('origin=');
    expect(text).not.toContain('123 Main St');
  });

  it('skips sending when Resend env is missing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      sendFeedbackAdminEmailNotification(payload, {
        ADMIN_EMAILS: 'admin@example.com',
      } as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      sent: false,
      skipped: true,
      reason: 'missing_resend_config',
      provider: 'resend',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends feedback email through Resend when configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);

    await expect(
      sendFeedbackAdminEmailNotification(payload, {
        RESEND_API_KEY: 'resend-test-key',
        FEEDBACK_FROM_EMAIL: 'PodPaiGo <feedback@podpaigo.test>',
        ADMIN_EMAILS: 'admin@example.com,ops@example.com',
      } as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({
      sent: true,
      recipientCount: 2,
      provider: 'resend',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer resend-test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      from: 'PodPaiGo <feedback@podpaigo.test>',
      to: ['admin@example.com', 'ops@example.com'],
      subject: '[PodPaiGo Beta Feedback] wrong_price',
    });
    expect(body.text).toContain('Page URL: https://podpaigo.test/results');
  });
});
