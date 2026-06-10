import { type PersistedClient, type Persister } from "@tanstack/react-query-persist-client";
import { openDB } from "./offlineQueue";

const CACHE_KEY = "react_query_cache";

function queryReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { __q: "Set", v: [...value] };
  }
  if (value instanceof Map) {
    return { __q: "Map", v: [...value] };
  }
  return value;
}

function queryReviver(_key: string, value: unknown): unknown {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (obj.__q === "Set" && Array.isArray(obj.v)) {
      return new Set(obj.v);
    }
    if (obj.__q === "Map" && Array.isArray(obj.v)) {
      return new Map(obj.v);
    }
  }
  return value;
}

export function createIndexedDbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readwrite");
        tx.objectStore("query_cache").put({ id: CACHE_KEY, value: JSON.stringify(client, queryReplacer), updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    restoreClient: async () => {
      const db = await openDB();
      return new Promise<PersistedClient | undefined>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readonly");
        const req = tx.objectStore("query_cache").get(CACHE_KEY);
        req.onsuccess = () => {
          const result = req.result;
          if (result?.value) {
            try { resolve(JSON.parse(result.value, queryReviver)); }
            catch { resolve(undefined); }
          } else {
            resolve(undefined);
          }
        };
        req.onerror = () => reject(req.error);
      });
    },
    removeClient: async () => {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("query_cache", "readwrite");
        tx.objectStore("query_cache").delete(CACHE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}
