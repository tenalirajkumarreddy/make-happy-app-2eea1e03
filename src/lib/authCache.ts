import { openDB } from "./offlineQueue";

export interface CachedAuthState {
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  } | null;
  role: string | null;
  profile: { full_name: string; email: string; avatar_url: string | null } | null;
  customer: { id: string; user_id: string | null; name: string; phone: string | null; email: string | null } | null;
  needsOnboarding: boolean;
  warehouses: string[];
  warehouse: { id: string; name: string } | null;
  cachedAt: string;
}

const AUTH_CACHE_KEY = "auth_cache";

export async function cacheAuthState(state: CachedAuthState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readwrite");
    const store = tx.objectStore("auth_cache");
    store.put({ id: AUTH_CACHE_KEY, ...state, cachedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAuthState(): Promise<CachedAuthState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readonly");
    const store = tx.objectStore("auth_cache");
    const req = store.get(AUTH_CACHE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAuthCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("auth_cache", "readwrite");
    const store = tx.objectStore("auth_cache");
    store.delete(AUTH_CACHE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
