import { getAdminEmails, isAdminEmail } from '../adminAuth';

describe('adminAuth', () => {
  const original = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = original;
    }
  });

  it('allows configured admin email', () => {
    process.env.ADMIN_EMAILS = 'pathocha000@gmail.com,ops@podpaigo.com';
    expect(isAdminEmail('pathocha000@gmail.com')).toBe(true);
    expect(getAdminEmails()).toEqual(['pathocha000@gmail.com', 'ops@podpaigo.com']);
  });

  it('blocks non-admin email', () => {
    process.env.ADMIN_EMAILS = 'pathocha000@gmail.com';
    expect(isAdminEmail('traveler@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });

  it('matches emails case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com';
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });
});
