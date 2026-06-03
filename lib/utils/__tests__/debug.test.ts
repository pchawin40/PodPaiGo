import { isPodPaiGoDebugUIEnabled } from '../debug';

describe('debug UI gate', () => {
  const originalDebugLogs = process.env.DEBUG_LOGS;
  const originalDebugUi = process.env.NEXT_PUBLIC_DEBUG_UI;

  afterEach(() => {
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

  test('can be enabled with DEBUG_LOGS=true', () => {
    process.env.DEBUG_LOGS = 'true';
    delete process.env.NEXT_PUBLIC_DEBUG_UI;

    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });

  test('can be enabled with NEXT_PUBLIC_DEBUG_UI=true', () => {
    delete process.env.DEBUG_LOGS;
    process.env.NEXT_PUBLIC_DEBUG_UI = 'true';

    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });
});
