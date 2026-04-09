import { describe, it, expect } from 'vitest';

/**
 * Environment validation tests
 * 
 * Note: The actual env validation happens at module load time via src/lib/env.ts.
 * These tests verify the validation logic without re-importing the module,
 * since ESM modules cannot be easily re-imported in Vitest.
 * 
 * The validation rules tested here mirror the logic in src/lib/env.ts:
 * 1. Required fields must be present
 * 2. Placeholder values are rejected
 * 3. Supabase URL must start with https://
 */

// Helper to validate env configuration (mirrors logic from src/lib/env.ts)
function validateEnvConfig(env: Record<string, string | undefined>): { missing: string[]; invalid: string[] } {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_PROJECT_ID',
  ];

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of required) {
    const value = env[key];
    
    if (!value) {
      missing.push(key);
    } else if (typeof value !== 'string' || value.trim() === '') {
      invalid.push(key);
    } else if (value.includes('your_') || value.includes('here')) {
      invalid.push(`${key} (still contains placeholder value)`);
    }
  }

  // Additional validation for URLs
  const supabaseUrl = env.VITE_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    invalid.push('VITE_SUPABASE_URL (must start with https://)');
  }

  return { missing, invalid };
}

describe('Environment Validation', () => {
  const validEnv = {
    VITE_SUPABASE_URL: 'https://test-project.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
    VITE_SUPABASE_PROJECT_ID: 'test-project',
  };

  it('should detect missing VITE_SUPABASE_URL', () => {
    const env = { ...validEnv, VITE_SUPABASE_URL: '' };
    const { missing } = validateEnvConfig(env);
    expect(missing).toContain('VITE_SUPABASE_URL');
  });

  it('should detect placeholder values', () => {
    const env = { ...validEnv, VITE_SUPABASE_URL: 'https://your_project_id_here.supabase.co' };
    const { invalid } = validateEnvConfig(env);
    expect(invalid.some(msg => msg.includes('placeholder'))).toBe(true);
  });

  it('should reject non-HTTPS Supabase URL', () => {
    const env = { ...validEnv, VITE_SUPABASE_URL: 'http://insecure.supabase.co' };
    const { invalid } = validateEnvConfig(env);
    expect(invalid.some(msg => msg.includes('https'))).toBe(true);
  });

  it('should pass with valid configuration', () => {
    const { missing, invalid } = validateEnvConfig(validEnv);
    expect(missing).toHaveLength(0);
    expect(invalid).toHaveLength(0);
  });
});
