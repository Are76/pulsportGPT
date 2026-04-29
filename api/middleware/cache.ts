interface CacheEntry {
  data: unknown;
  cachedAt: number;
  ttl: number;
}

const store = new Map<string, CacheEntry>();

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

export interface CacheHit {
  data: unknown;
  cachedAt: number;
  ttlRemaining: number;
}

export function getCached(key: string): CacheHit | null {
  const entry = store.get(key);
  if (!entry) return null;

  const now = nowSecs();
  const ttlRemaining = entry.ttl - (now - entry.cachedAt);
  if (ttlRemaining <= 0) {
    store.delete(key);
    return null;
  }
  return { data: entry.data, cachedAt: entry.cachedAt, ttlRemaining };
}

export function setCached(key: string, data: unknown, ttlSeconds: number): void {
  store.set(key, { data, cachedAt: nowSecs(), ttl: ttlSeconds });
}
