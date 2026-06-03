/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ParkingAccessBadge, { accessBadgeLabel } from '@/app/components/ParkingAccessBadge';
import type { ParkingAccessType } from '@/lib/parking/destinationParkingClassifier';

describe('ParkingAccessBadge', () => {
  test('renders all access statuses', () => {
    const accessTypes: ParkingAccessType[] = [
      'public',
      'customer_only',
      'employee_only',
      'tenant_only',
      'permit_only',
      'event_only',
      'unknown',
    ];

    for (const accessType of accessTypes) {
      const { unmount } = render(<ParkingAccessBadge accessType={accessType} />);
      expect(screen.getByText(accessBadgeLabel(accessType))).toBeInTheDocument();
      expect(
        screen.getByText(/Confirm rules with the garage or business before relying on this\./),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
