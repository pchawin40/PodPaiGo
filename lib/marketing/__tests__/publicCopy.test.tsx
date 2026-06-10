/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  DATA_TRANSPARENCY_DISCLOSURE,
  PRICING_BETA_BILLING_NOTE,
  PRICING_BETA_FREE_HEADLINE,
} from '../publicCopy';
import PricingPage from '../../../app/pricing/page';

jest.mock('../../../app/components/SiteHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="site-header" />,
}));

describe('public marketing copy', () => {
  test('data transparency disclosure is partner-safe and confirmatory', () => {
    expect(DATA_TRANSPARENCY_DISCLOSURE).toMatch(/live, estimated, cached, or provider-linked/i);
    expect(DATA_TRANSPARENCY_DISCLOSURE).toMatch(/Always confirm final price/i);
    expect(DATA_TRANSPARENCY_DISCLOSURE).not.toMatch(/placeholder|stripe|broken/i);
  });

  test('pricing page says free during beta and avoids dev-facing billing copy', () => {
    render(<PricingPage />);

    expect(screen.getByRole('heading', { name: /Free during beta/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PRICING_BETA_FREE_HEADLINE.replace(/\./g, '\\.'), 'i'))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(PRICING_BETA_BILLING_NOTE, 'i'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planned later' })).toBeInTheDocument();
    expect(screen.getByText(DATA_TRANSPARENCY_DISCLOSURE)).toBeInTheDocument();

    expect(screen.queryByText(/Stripe subscriptions are not enabled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/placeholder only/i)).not.toBeInTheDocument();
  });
});
