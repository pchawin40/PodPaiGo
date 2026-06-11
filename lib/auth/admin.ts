import { NextResponse } from 'next/server';
import { createSupabaseAuthClient } from '@/lib/monetization/recordOutboundClick';

type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

export type AdminUser = {
  id: string | null;
  email: string | null;
  source: 'supabase' | 'local-dev';
};

export type AdminGuardResult =
  | {
      ok: true;
      user: AdminUser;
      userId: string | null;
      email: string | null;
    }
  | {
      ok: false;
      status: 401 | 403;
      signedIn: boolean;
      response: NextResponse;
    };

function isTruthyFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
}

/**
 * Admin access is determined by email allowlist (ADMIN_EMAILS).
 * Comma-separated, case-insensitive. Example: admin@example.com,ops@example.com
 */
export function getAdminEmails(raw = process.env.ADMIN_EMAILS ?? ''): string[] {
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  allowlist: string[] = getAdminEmails(),
): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return allowlist.includes(normalized);
}

export function isAdminUser(user: { email?: string | null } | null | undefined): boolean {
  return isAdminEmail(user?.email);
}

export function isLocalAdminDebugEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') return false;
  return (
    isTruthyFlag(env.ALLOW_LOCAL_ADMIN) ||
    isTruthyFlag(env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG)
  );
}

export function getBearerAccessToken(request: HeaderReadable): string | null {
  const header = request.headers.get('authorization');
  return header?.replace(/^Bearer\s+/i, '').trim() || null;
}

function adminAuthResponse(status: 401 | 403): NextResponse {
  if (status === 401) {
    return NextResponse.json(
      {
        error: 'authentication_required',
        message: 'Sign in with an admin account to continue.',
      },
      { status },
    );
  }

  return NextResponse.json(
    {
      error: 'admin_required',
      message: 'Admin access required.',
    },
    { status },
  );
}

function authFailure(status: 401 | 403, signedIn: boolean): AdminGuardResult {
  return {
    ok: false,
    status,
    signedIn,
    response: adminAuthResponse(status),
  };
}

export async function requireAdmin(request: HeaderReadable): Promise<AdminGuardResult> {
  const accessToken = getBearerAccessToken(request);

  if (!accessToken) {
    if (isLocalAdminDebugEnabled()) {
      const user: AdminUser = {
        id: 'local-admin',
        email: 'local-admin@localhost',
        source: 'local-dev',
      };
      return {
        ok: true,
        user,
        userId: user.id,
        email: user.email,
      };
    }

    return authFailure(401, false);
  }

  const authClient = createSupabaseAuthClient(accessToken);
  if (!authClient) {
    return authFailure(401, false);
  }

  try {
    const { data, error } = await authClient.auth.getUser();
    const user = data.user;

    if (error || !user) {
      return authFailure(401, false);
    }

    if (!isAdminEmail(user.email)) {
      return authFailure(403, true);
    }

    return {
      ok: true,
      user: {
        id: user.id ?? null,
        email: user.email ?? null,
        source: 'supabase',
      },
      userId: user.id ?? null,
      email: user.email ?? null,
    };
  } catch {
    return authFailure(401, false);
  }
}
