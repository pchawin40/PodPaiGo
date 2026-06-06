/**
 * @jest-environment jsdom
 */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateTextInput } from '../TripFlow';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

function DateHarness() {
  const [value, setValue] = useState('');

  return (
    <DateTextInput
      value={value}
      onChange={setValue}
      ariaLabel="Parking check-in date"
    />
  );
}

function getNativeDateInput(container: HTMLElement): HTMLInputElement {
  const calendar = container.querySelector('input[type="date"]');
  if (!(calendar instanceof HTMLInputElement)) {
    throw new Error('Native date input not found');
  }
  return calendar;
}

describe('DateTextInput', () => {
  test('preserves a partially typed year instead of clearing the field', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '11/13/2' } });
    expect(input.value).toBe('11/13/2');

    fireEvent.change(input, { target: { value: '11/13/2026' } });
    expect(input.value).toBe('11/13/2026');
  });

  test('preserves partial ISO typing without normalizing early', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2026-06' } });

    expect(input.value).toBe('2026-06');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('normalizes MM/DD/YYYY input on blur', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '06/05/2026' } });
    expect(input.value).toBe('06/05/2026');

    fireEvent.blur(input);

    expect(input.value).toBe('2026-06-05');
  });

  test('accepts YYYY-MM-DD input on blur', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2026-06-05' } });
    fireEvent.blur(input);

    expect(input.value).toBe('2026-06-05');
  });

  test('calendar selection updates the normalized value', () => {
    const { container } = render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;
    const calendar = getNativeDateInput(container);

    fireEvent.change(calendar, { target: { value: '2026-06-05' } });

    expect(input.value).toBe('2026-06-05');
    expect(calendar.value).toBe('2026-06-05');
  });

  test('clicking the calendar icon opens the native date picker', () => {
    const { container } = render(<DateHarness />);

    const calendar = getNativeDateInput(container);
    const showPicker = jest.fn();
    const click = jest.spyOn(calendar, 'click').mockImplementation(() => undefined);
    Object.defineProperty(calendar, 'showPicker', {
      configurable: true,
      value: showPicker,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();

    click.mockRestore();
  });

  test('native date input stays in the icon area for showPicker', () => {
    const { container } = render(<DateHarness />);

    const calendar = getNativeDateInput(container);

    expect(calendar.className).toContain('opacity-0');
    expect(calendar.className).toContain('right-3');
    expect(calendar.className).not.toContain('pointer-events-none');
    expect(calendar.className).not.toContain('-left-[9999px]');
  });

  test('calendar icon falls back to clicking the native date input', () => {
    const { container } = render(<DateHarness />);

    const calendar = getNativeDateInput(container);
    const click = jest.spyOn(calendar, 'click').mockImplementation(() => undefined);
    const focus = jest.spyOn(calendar, 'focus').mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    click.mockRestore();
    focus.mockRestore();
  });

  test('invalid date shows an error without erasing the typed value', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '02/31/2026' } });
    fireEvent.blur(input);

    expect(input.value).toBe('02/31/2026');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a valid date as MM/DD/YYYY or YYYY-MM-DD, or pick from calendar.',
    );
  });
});
