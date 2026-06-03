/** @jest-environment node */

import { isAdminEmail } from '../lib/admin/adminAuth';

describe('admin analytics API access', () => {
  const original = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = original;
    }
  });

  it('blocks non-admin emails before dashboard fetch', () => {
    process.env.ADMIN_EMAILS = 'pathocha000@gmail.com';
    expect(isAdminEmail('other@example.com')).toBe(false);
  });

  it('allows configured admin email before dashboard fetch', () => {
    process.env.ADMIN_EMAILS = 'pathocha000@gmail.com';
    expect(isAdminEmail('pathocha000@gmail.com')).toBe(true);
  });
});
