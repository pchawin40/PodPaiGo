import { isPodPaiGoDebugUIEnabled } from '../debug';

describe('debug UI gate', () => {
  const originalDebugLogs = process.env.DEBUG_LOGS;
  const originalDebugUi = process.env.NEXT_PUBLIC_DEBUG_UI;
  const originalAdminDebug = process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  const originalAllowLocalAdmin = process.env.ALLOW_LOCAL_ADMIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;

    if (originalDebugLogs === undefined) {
      delete process.env.DEBUG_LOGS;
    } else {
      process.env.DEBUG_LOGS = originalDebugLogs;
    }

    if (originalDebugUi === undefined) {
      delete process.env.NEXT_PUBLIC_DEBUG_UI;
    } else {
      process.env.NEXT_PUBLIC_DEBUG_UI = originalDebugUi;
    }

    if (originalAdminDebug === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = originalAdminDebug;
    }

    if (originalAllowLocalAdmin === undefined) {
      delete process.env.ALLOW_LOCAL_ADMIN;
    } else {
      process.env.ALLOW_LOCAL_ADMIN = originalAllowLocalAdmin;
    }
  });

  test('is disabled by default in development without explicit flags', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEBUG_LOGS;
    delete process.env.NEXT_PUBLIC_DEBUG_UI;

    expect(isPodPaiGoDebugUIEnabled()).toBe(false);
  });

  test('is disabled in production without explicit debug flags', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEBUG_LOGS;
    delete process.env.NEXT_PUBLIC_DEBUG_UI;

    expect(isPodPaiGoDebugUIEnabled()).toBe(false);
  });

  test('can be enabled outside production with DEBUG_LOGS=true', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEBUG_LOGS = 'true';
    delete process.env.NEXT_PUBLIC_DEBUG_UI;

    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });

  test('can be enabled outside production with NEXT_PUBLIC_DEBUG_UI=true', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEBUG_LOGS;
    process.env.NEXT_PUBLIC_DEBUG_UI = 'true';

    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });

  test('can be enabled outside production with local admin debug flags', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = 'true';
    expect(isPodPaiGoDebugUIEnabled()).toBe(true);

    delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
    process.env.ALLOW_LOCAL_ADMIN = 'true';
    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });

  test('does not trust public debug flags in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_LOGS = 'true';
    process.env.NEXT_PUBLIC_DEBUG_UI = 'true';
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = 'true';
    process.env.ALLOW_LOCAL_ADMIN = 'true';

    expect(isPodPaiGoDebugUIEnabled()).toBe(false);
  });
});
