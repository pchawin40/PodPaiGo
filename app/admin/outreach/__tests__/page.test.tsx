/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AdminOutreachPage from '../page';

const longBody =
  'Hello,\n\n' +
  'ThisLineContainsAReallyLongUnbrokenURLLikeString_https://example.com/partner/referrals/podpaigo/' +
  'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789\n\n' +
  'Thanks.';

jest.mock('../../../components/SiteHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="site-header" />,
}));

jest.mock('../../AdminNav', () => ({
  __esModule: true,
  default: () => <nav data-testid="admin-nav" />,
}));

jest.mock('../../../components/useAdminStatus', () => ({
  useAdminStatus: () => ({
    configured: true,
    loading: false,
    signedIn: true,
    isAdmin: true,
    accessToken: 'admin-token',
    statusCode: 200,
  }),
}));

describe('AdminOutreachPage', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        defaults: {
          fromName: 'Ham from PodPaiGo',
          fromEmail: 'hello@podpaigo.com',
          replyTo: 'p.chawin40@gmail.com',
          testRecipient: 'admin@example.com',
        },
        templates: [
          {
            id: 'spothero-partner',
            label: 'SpotHero partner outreach',
            subject: 'Partner / deep-link tracking for PodPaiGo parking referrals',
            body: longBody,
          },
        ],
        resendConfigured: true,
      }),
    })) as jest.Mock;
  });

  test('preview body wraps long plain-text content inside a scrollable card area', async () => {
    render(<AdminOutreachPage />);

    const preview = await screen.findByTestId('outreach-email-preview-body');

    await waitFor(() => {
      expect(preview).toHaveTextContent('ThisLineContainsAReallyLongUnbrokenURLLikeString');
    });

    expect(preview).toHaveClass('whitespace-pre-wrap');
    expect(preview).toHaveClass('break-words');
    expect(preview).toHaveClass('overflow-auto');
    expect(preview).toHaveClass('max-h-[36rem]');
    expect(preview).toHaveClass('[overflow-wrap:anywhere]');
    expect(preview).not.toHaveClass('overflow-x-auto');
    expect(screen.getByText(/Test sends go to admin@example.com/i)).toBeInTheDocument();
  });
});
