/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ParkingValidationBadge, {
  validationBadgeLabel,
} from '@/app/components/ParkingValidationBadge';

describe('ParkingValidationBadge', () => {
  test('renders all validation statuses', () => {
    const statuses = ['free', 'validated', 'possibly_validated', 'paid_only', 'unknown'] as const;

    for (const status of statuses) {
      const { unmount } = render(<ParkingValidationBadge status={status} />);
      expect(screen.getByText(validationBadgeLabel(status))).toBeInTheDocument();
      expect(
        screen.getByText(/Confirm rules with the garage or business before relying on this\./),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
