'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

export type ClientAdminStatus = {
  configured: boolean;
  loading: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  accessToken: string | null;
  statusCode: number | null;
};

function shouldCheckAdminStatus(accessToken: string | null): boolean {
  if (accessToken) return true;
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.NODE_ENV !== 'production';
}

function canCheckAdminStatus(configured: boolean): boolean {
  return configured || process.env.NODE_ENV !== 'production';
}

export function useAdminStatus(): ClientAdminStatus {
  const { user, session, loading: authLoading, configured } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [isAdmin, setIsAdmin] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (
      !canCheckAdminStatus(configured) ||
      authLoading ||
      !shouldCheckAdminStatus(accessToken)
    ) {
      setIsAdmin(false);
      setStatusCode(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const headers: HeadersInit = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};

    fetch('/api/admin/status', { headers })
      .then(async (response) => {
        if (!cancelled) setStatusCode(response.status);
        if (!response.ok) return null;
        return response.json() as Promise<{ isAdmin?: boolean }>;
      })
      .then((data) => {
        if (!cancelled) setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setStatusCode(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, configured]);

  return {
    configured,
    loading: authLoading || checking,
    signedIn: Boolean(user && accessToken),
    isAdmin,
    accessToken,
    statusCode,
  };
}
