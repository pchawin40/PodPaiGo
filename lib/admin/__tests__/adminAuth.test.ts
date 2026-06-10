import {
  getAdminEmails,
  isAdminEmail,
  isLocalAdminDebugEnabled,
} from '../adminAuth';

describe('adminAuth', () => {
  const original = process.env.ADMIN_EMAILS;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocalAdmin = process.env.ALLOW_LOCAL_ADMIN;
  const originalPublicAdminDebug = process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = original;
    }

    process.env.NODE_ENV = originalNodeEnv;

    if (originalLocalAdmin === undefined) {
      delete process.env.ALLOW_LOCAL_ADMIN;
    } else {
      process.env.ALLOW_LOCAL_ADMIN = originalLocalAdmin;
    }

    if (originalPublicAdminDebug === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = originalPublicAdminDebug;
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

  it('allows local admin debug only outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_LOCAL_ADMIN = 'true';
    expect(isLocalAdminDebugEnabled()).toBe(true);

    process.env.NODE_ENV = 'production';
    expect(isLocalAdminDebugEnabled()).toBe(false);
  });

  it('does not trust client-side admin debug flags in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = 'true';
    expect(isLocalAdminDebugEnabled()).toBe(false);
  });
});
