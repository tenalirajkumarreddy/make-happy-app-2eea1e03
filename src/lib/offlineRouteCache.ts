/**
 * Offline route data cache.
 * Reuses IndexedDB from offline queue (query_cache store, created in DB v5).
 * Stores serialized query results with TTL-based expiration.
 */

import { openDB } from "./offlineQueue";

const fiveMinutes = 300_000;

interface CacheEntry<T> {
  id: string;
  data: T;
  cachedAt: string;
  ttl: number;
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() > entry.ttl;
}

export async function cacheQueryResult<T>(
  key: string,
  data: T,
  ttlMs: number = fiveMinutes
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("query_cache")) {
      resolve();
      return;
    }
    const tx = db.transaction("query_cache", "readwrite");
    const store = tx.objectStore("query_cache");
    store.put({
      id: `route:${key}`,
      data,
      cachedAt: new Date().toISOString(),
      ttl: ttlMs,
    } as CacheEntry<T>);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedQueryResult<T>(
  key: string
): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("query_cache")) {
      resolve(null);
      return;
    }
    const tx = db.transaction("query_cache", "readonly");
    const store = tx.objectStore("query_cache");
    const req = store.get(`route:${key}`);
    req.onsuccess = () => {
      const entry = req.result as CacheEntry<T> | undefined;
      if (!entry || isExpired(entry)) {
        resolve(null);
        return;
      }
      resolve(entry.data);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function invalidateRouteCache(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("query_cache")) {
      resolve();
      return;
    }
    const tx = db.transaction("query_cache", "readwrite");
    const store = tx.objectStore("query_cache");
    store.delete(`route:${key}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
