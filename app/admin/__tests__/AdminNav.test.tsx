/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminNav from '../AdminNav';
import AdminRouteBoundary from '../AdminRouteBoundary';
import type { ClientAdminStatus } from '../../components/useAdminStatus';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('../../components/SiteHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="site-header" />,
}));

jest.mock('../../components/useAdminStatus', () => ({
  useAdminStatus: jest.fn(),
}));

const { usePathname } = jest.requireMock('next/navigation') as {
  usePathname: jest.Mock;
};
const { useAdminStatus } = jest.requireMock('../../components/useAdminStatus') as {
  useAdminStatus: jest.Mock;
};

function mockAdminStatus(overrides: Partial<ClientAdminStatus> = {}) {
  useAdminStatus.mockReturnValue({
    configured: true,
    loading: false,
    signedIn: true,
    isAdmin: true,
    accessToken: 'admin-token',
    statusCode: 200,
    ...overrides,
  });
}

describe('AdminNav', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathname.mockReturnValue('/admin/outreach');
    mockAdminStatus();
  });

  test('shows admin area links including outreach for admins', () => {
    render(<AdminNav />);

    expect(screen.getByRole('link', { name: 'Parking submissions' })).toHaveAttribute(
      'href',
      '/admin/parking-submissions',
    );
    expect(screen.getByRole('link', { name: 'Outreach email' })).toHaveAttribute(
      'href',
      '/admin/outreach',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/admin/analytics',
    );
    expect(screen.getByRole('link', { name: 'Parking diagnostics' })).toHaveAttribute(
      'href',
      '/admin/parking-diagnostics',
    );
    expect(screen.getByRole('link', { name: 'Outreach email' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('admin route boundary blocks outreach nav for non-admin users', () => {
    mockAdminStatus({ isAdmin: false, statusCode: 403 });

    render(
      <AdminRouteBoundary>
        <AdminNav />
        <div>Outreach composer</div>
      </AdminRouteBoundary>,
    );

    expect(screen.queryByRole('link', { name: 'Outreach email' })).not.toBeInTheDocument();
    expect(screen.queryByText('Outreach composer')).not.toBeInTheDocument();
    expect(screen.getByText('Admin access required.')).toBeInTheDocument();
  });

  test('admin route boundary renders outreach nav for admins', () => {
    render(
      <AdminRouteBoundary>
        <AdminNav />
        <div>Outreach composer</div>
      </AdminRouteBoundary>,
    );

    expect(screen.getByRole('link', { name: 'Outreach email' })).toHaveAttribute(
      'href',
      '/admin/outreach',
    );
    expect(screen.getByText('Outreach composer')).toBeInTheDocument();
  });
});
