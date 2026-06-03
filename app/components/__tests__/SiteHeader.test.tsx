/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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
    useAuth.mockReturnValue({
      user: null,
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
      loading: false,
      configured: true,
      signOut: jest.fn(),
    });

    renderHeader();
    expect(screen.getAllByRole('button', { name: /account menu/i }).length).toBeGreaterThan(0);
  });
});
