'use client';

import Link from 'next/link';
import { useAuth } from './AuthProvider';

export default function AuthNav() {
  const { user, loading, configured, signOut } = useAuth();

  if (!configured) {
    return null;
  }

  if (loading) {
    return (
      <span className="hidden shrink-0 rounded-full px-3 py-2 text-sm text-slate-500 md:inline-flex">
        Account…
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="hidden shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:inline-flex"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="hidden items-center gap-2 md:flex">
      <Link
        href="/account"
        className="max-w-[180px] truncate rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        title={user.email || 'Account'}
      >
        {user.email || 'Account'}
      </Link>
      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
        className="rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Sign out
      </button>
    </div>
  );
}
