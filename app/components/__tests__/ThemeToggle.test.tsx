/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from '@/app/components/ThemeToggle';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import { mockMatchMedia } from '@/lib/test/mockMatchMedia';

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    mockMatchMedia();
  });

  test('renders theme toggle button', () => {
    renderWithTheme();
    expect(
      screen.getAllByRole('button', { name: /Switch to (light|dark) mode/i }).length,
    ).toBeGreaterThan(0);
  });

  test('has accessible label for current theme', () => {
    renderWithTheme();
    const button = screen.getAllByRole('button', { name: /Switch to (light|dark) mode/i })[0];
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toMatch(/Switch to (light|dark) mode/);
  });

  test('toggles theme on click', () => {
    renderWithTheme();
    const button = screen.getAllByRole('button', { name: /Switch to (light|dark) mode/i })[0];
    const initialLabel = button.getAttribute('aria-label');

    fireEvent.click(button);

    expect(button.getAttribute('aria-label')).not.toBe(initialLabel);
  });
});
