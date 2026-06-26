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

export async function cacheAuthState(_state: CachedAuthState): Promise<void> {
  return;
}

export async function getCachedAuthState(): Promise<CachedAuthState | null> {
  return null;
}

export async function clearAuthCache(): Promise<void> {
  return;
}
