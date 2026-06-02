'use client';

import { AuthProvider } from './AuthProvider';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
