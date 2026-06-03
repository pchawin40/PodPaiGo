import { getOrCreateAnonymousId, getOrCreateSessionId } from '../analyticsIds';

describe('analyticsIds', () => {
  function createStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => {
        map.delete(key);
      },
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  }

  it('keeps anonymous id stable across reads', () => {
    const storage = createStorage();
    const first = getOrCreateAnonymousId(storage);
    const second = getOrCreateAnonymousId(storage);

    expect(first).toBe(second);
    expect(first.startsWith('anon-')).toBe(true);
  });

  it('keeps session id stable within the same session window', () => {
    const storage = createStorage();
    const first = getOrCreateSessionId(storage);
    const second = getOrCreateSessionId(storage);

    expect(first).toBe(second);
    expect(first.startsWith('sess-')).toBe(true);
  });
});
