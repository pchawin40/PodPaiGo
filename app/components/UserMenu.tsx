'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getUserDisplayName } from '../../lib/auth/userProfile';
import { useAuth } from './AuthProvider';
import UserAvatar from './UserAvatar';

type UserMenuProps = {
  onNavigate?: () => void;
};

export default function UserMenu({ onNavigate }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  if (!user) return null;

  const displayName = getUserDisplayName(user);

  const closeMenu = () => {
    setOpen(false);
    onNavigate?.();
  };

  const handleSignOut = () => {
    closeMenu();
    void signOut();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={displayName ? `${displayName} account menu` : 'Account menu'}
        onClick={() => setOpen((current) => !current)}
        className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <UserAvatar user={user} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
        >
          {displayName ? (
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-950">
              {displayName}
            </div>
          ) : null}

          <Link
            href="/account"
            role="menuitem"
            onClick={closeMenu}
            className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Account
          </Link>
          <Link
            href="/account#saved-trips"
            role="menuitem"
            onClick={closeMenu}
            className="block px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Saved trips
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
