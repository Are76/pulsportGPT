type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export function createTtlCache<T>(ttlMs: number) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive finite number');
  }

  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key: string) {
      const entry = entries.get(key);

      if (!entry) {
        return undefined;
      }

      if (Date.now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }

      return entry.value;
    },
    set(key: string, value: T) {
      entries.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
    },
    delete(key: string) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}
