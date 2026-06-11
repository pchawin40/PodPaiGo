import type { ReactNode } from 'react';
import AdminRouteBoundary from './AdminRouteBoundary';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRouteBoundary>{children}</AdminRouteBoundary>;
}
