import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { env } from '@/lib/env';

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Safe storage adapter that works in both browser and native contexts
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage?.setItem(key, value);
    } catch {
      // Ignore storage errors in native context
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage?.removeItem(key);
    } catch {
      // Ignore storage errors in native context
    }
  },
};

// Create a custom fetch with timeout
const createFetchWithTimeout = (timeoutMs: number = 30000) => {
  return (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fetch(url, {
        ...init,
        signal: controller.signal,
      })
        .then((response) => {
          clearTimeout(timeoutId);
          resolve(response);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  };
};

export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: safeStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: createFetchWithTimeout(30000), // 30 second timeout
      headers: {
        'X-Client-Info': 'bizmanager-web',
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
      reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),
    },
  }
);