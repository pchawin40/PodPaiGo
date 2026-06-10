/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SiteHeader from '@/app/components/SiteHeader';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { mockMatchMedia } from '@/lib/test/mockMatchMedia';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = jest.requireMock('@/app/components/AuthProvider');

function renderHeader() {
  return render(
    <ThemeProvider>
      <SiteHeader />
    </ThemeProvider>,
  );
}

describe('SiteHeader', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMedia();
    jest.restoreAllMocks();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ signedIn: false, isAdmin: false }),
    })) as jest.Mock;
    useAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      configured: true,
      signOut: jest.fn(),
    });
  });

  test('renders theme toggle with accessible label', () => {
    renderHeader();
    expect(
      screen.getAllByRole('button', { name: /Switch to (light|dark) mode/i }).length,
    ).toBeGreaterThan(0);
  });

  test('renders sign in when logged out', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: /Sign in/i }).length).toBeGreaterThan(0);
  });

  test('renders mobile menu trigger', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /Open menu/i })).toBeInTheDocument();
  });

  test('shows avatar menu when logged in on desktop path', () => {
    useAuth.mockReturnValue({
      user: { id: 'user-1', email: 'traveler@example.com' },
      session: { access_token: 'token-1' },
      loading: false,
      configured: true,
      signOut: jest.fn(),
    });

    renderHeader();
    expect(screen.getAllByRole('button', { name: /account menu/i }).length).toBeGreaterThan(0);
  });

  test('does not show admin nav for signed-out or non-admin users', async () => {
    renderHeader();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();

    useAuth.mockReturnValue({
      user: { id: 'user-1', email: 'traveler@example.com' },
      session: { access_token: 'token-1' },
      loading: false,
      configured: true,
      signOut: jest.fn(),
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'admin_required' }),
    });

    renderHeader();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/status', {
        headers: { Authorization: 'Bearer token-1' },
      });
    });
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  test('renders public nav links without admin for non-admin users', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Quick Go' })).toHaveAttribute('href', '/quick-go');
    expect(screen.getByRole('link', { name: 'Airports' })).toHaveAttribute('href', '/airports');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/roadmap');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'Plan trip' })).toHaveAttribute('href', '/trip');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  test('shows admin nav for signed-in admin', async () => {
    useAuth.mockReturnValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
      session: { access_token: 'admin-token' },
      loading: false,
      configured: true,
      signOut: jest.fn(),
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ signedIn: true, isAdmin: true, email: 'admin@example.com' }),
    });

    renderHeader();

    expect(await screen.findByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin/parking-submissions',
    );
  });
});
