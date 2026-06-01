import { isPodPaiGoDebugUIEnabled } from '../debug';

describe('debug UI gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDebugFlag = process.env.NEXT_PUBLIC_PODPAIGO_DEBUG;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDebugFlag === undefined) {
      delete process.env.NEXT_PUBLIC_PODPAIGO_DEBUG;
    } else {
      process.env.NEXT_PUBLIC_PODPAIGO_DEBUG = originalDebugFlag;
    }
  });

  test('is disabled in production without explicit debug flag', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_PODPAIGO_DEBUG;

    expect(isPodPaiGoDebugUIEnabled()).toBe(false);
  });

  test('can be enabled in production with NEXT_PUBLIC_PODPAIGO_DEBUG=1', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_PODPAIGO_DEBUG = '1';

    expect(isPodPaiGoDebugUIEnabled()).toBe(true);
  });
});
