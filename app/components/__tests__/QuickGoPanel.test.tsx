/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuickGoPanel from '@/app/components/QuickGoPanel';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

function ensureOriginEditorOpen() {
  const changeButton = screen.queryByRole('button', { name: 'Change' });
  if (changeButton) {
    fireEvent.click(changeButton);
  }
}

describe('QuickGoPanel', () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem(
      'podpaigo-recent-origins',
      JSON.stringify(['456 Oak Avenue, Sample Town, ST']),
    );
  });

  test('blocks quick-go search until a starting point is provided', () => {
    render(<QuickGoPanel />);

    fireEvent.change(screen.getByPlaceholderText('Where are you going?'), {
      target: { value: 'Grocery store' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText('Add a starting point to compare routes.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type an address or place')).toBeInTheDocument();
  });

  test('accepts typed origin and starts quick-go search', () => {
    render(<QuickGoPanel />);

    fireEvent.change(screen.getByPlaceholderText('Where are you going?'), {
      target: { value: 'Grocery store' },
    });
    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const path = String(pushMock.mock.calls[0]?.[0]);
    expect(path).toMatch(/^\/results\//);

    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    expect(storedKey).toBeTruthy();

    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.type).toBe('quick-go');
    expect(payload.tripData?.destination).toBe('Grocery store');
    expect(payload.tripData?.originSource).toBe('manual');
    expect(payload.tripData?.origin).toBe('123 Main Street, Example City, ST');
  });

  test('requires explicit saved-origin choice instead of silently using localStorage', () => {
    render(<QuickGoPanel />);

    fireEvent.change(screen.getByPlaceholderText('Where are you going?'), {
      target: { value: 'Coffee shop' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).not.toHaveBeenCalled();

    ensureOriginEditorOpen();
    fireEvent.click(screen.getByRole('button', { name: /Use saved:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const storedKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith('podpaigo-trip-'),
    );
    const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
      tripData?: Record<string, string>;
    };
    expect(payload.tripData?.originSource).toBe('saved');
    expect(payload.tripData?.origin).toBe('456 Oak Avenue, Sample Town, ST');
  });

  test('airport destination offers full airport planner prompt', () => {
    render(<QuickGoPanel />);

    fireEvent.change(screen.getByPlaceholderText('Where are you going?'), {
      target: { value: 'SEA Airport' },
    });
    ensureOriginEditorOpen();
    fireEvent.change(screen.getByPlaceholderText('Type an address or place'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Go' }));

    expect(
      screen.getByText('This looks like an airport trip. Want to use the full airport planner?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use full airport planner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue Quick Go' })).toBeInTheDocument();
  });
});
