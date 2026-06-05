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

describe('DateTextInput', () => {
  test('preserves a partially typed year instead of clearing the field', () => {
    render(<DateHarness />);

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '11/13/2' } });
    expect(input.value).toBe('11/13/2');

    fireEvent.change(input, { target: { value: '11/13/2026' } });
    expect(input.value).toBe('11/13/2026');
  });
});
