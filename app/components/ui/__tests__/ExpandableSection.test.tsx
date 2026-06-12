/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ExpandableSection from '../ExpandableSection';

describe('ExpandableSection', () => {
  test('collapses content by default and exposes accessible toggle state', () => {
    render(
      <ExpandableSection title="Customize trip" summary="Easiest · leaving now">
        <p>Hidden details</p>
      </ExpandableSection>,
    );

    const toggle = screen.getByRole('button', { name: /Customize trip/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Easiest · leaving now')).toBeInTheDocument();

    // Body stays mounted (so form fields keep values) but is hidden when collapsed.
    const body = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(body).not.toBeNull();
    expect(body).toHaveAttribute('hidden');
  });

  test('expands and collapses on click', () => {
    render(
      <ExpandableSection title="Details">
        <p>Visible after expand</p>
      </ExpandableSection>,
    );

    const toggle = screen.getByRole('button', { name: /Details/i });
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(body).not.toHaveAttribute('hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveAttribute('hidden');
  });

  test('respects defaultOpen', () => {
    render(
      <ExpandableSection title="Open section" defaultOpen>
        <p>Shown</p>
      </ExpandableSection>,
    );

    const toggle = screen.getByRole('button', { name: /Open section/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('supports controlled open with onOpenChange', () => {
    const handleChange = jest.fn();
    const { rerender } = render(
      <ExpandableSection title="Parking time" open={false} onOpenChange={handleChange}>
        <p>Parking fields</p>
      </ExpandableSection>,
    );

    const toggle = screen.getByRole('button', { name: /Parking time/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(handleChange).toHaveBeenCalledWith(true);
    // Stays closed until the controlling parent updates the prop.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <ExpandableSection title="Parking time" open onOpenChange={handleChange}>
        <p>Parking fields</p>
      </ExpandableSection>,
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
