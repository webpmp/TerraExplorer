interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class TTLCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > this.ttlMs;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// 1 hour for encyclopedic data
export const descriptionCache = new TTLCache<any>(60 * 60 * 1000);
// 15 minutes for news
export const newsCache = new TTLCache<any>(15 * 60 * 1000);
// 1 hour for images
export const imageCache = new TTLCache<any>(60 * 60 * 1000);
// 1 hour for nearby places
export const nearbyCache = new TTLCache<any>(60 * 60 * 1000);
