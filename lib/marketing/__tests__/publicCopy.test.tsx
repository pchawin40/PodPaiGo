/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  DATA_TRANSPARENCY_DISCLOSURE,
  DATA_TRANSPARENCY_SHORT,
  PRICING_BETA_BILLING_NOTE,
  PRICING_BETA_FREE_HEADLINE,
  PRODUCT_TAGLINE,
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

  test('short disclosure stays honest but is scannable for first-time users', () => {
    // Honest: still tells users to verify final price and posted signs.
    expect(DATA_TRANSPARENCY_SHORT).toMatch(/sign/i);
    expect(DATA_TRANSPARENCY_SHORT).toMatch(/price/i);
    // Scannable: meaningfully shorter than the full legal disclosure.
    expect(DATA_TRANSPARENCY_SHORT.length).toBeLessThan(DATA_TRANSPARENCY_DISCLOSURE.length);
  });

  test('product tagline explains what PodPaiGo does in plain language', () => {
    expect(PRODUCT_TAGLINE).toMatch(/park/i);
    expect(PRODUCT_TAGLINE).toMatch(/easiest|cheapest|fastest/i);
    // Avoid internal jargon a new user would not understand.
    expect(PRODUCT_TAGLINE).not.toMatch(/provenance|enrichment|provider-linked|cached/i);
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
