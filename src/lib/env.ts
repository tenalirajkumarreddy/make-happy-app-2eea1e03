/**
 * Environment variable validation
 * Ensures all required env vars are present and valid at startup
 */

interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  VITE_SUPABASE_PROJECT_ID: string;
  VITE_SENTRY_DSN?: string;
  VITE_SENTRY_ENVIRONMENT?: string;
}

export interface EnvIssues {
  missing: string[];
  invalid: string[];
  errorMessage: string | null;
}

function validateEnv(): { env: Env; issues: EnvIssues } {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_PROJECT_ID',
  ] as const;

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of required) {
    const value = import.meta.env[key];
    
    if (!value) {
      missing.push(key);
    } else if (typeof value !== 'string' || value.trim() === '') {
      invalid.push(key);
    } else if (value.includes('your_') || value.includes('here')) {
      invalid.push(`${key} (still contains placeholder value)`);
    }
  }

  // Additional validation for URLs
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    invalid.push('VITE_SUPABASE_URL (must start with https://)');
  }

  const errorMessage =
    missing.length > 0 || invalid.length > 0
      ? [
          '❌ Environment Configuration Error',
          '',
          missing.length > 0
            ? `Missing variables:\n${missing.map((k) => `  - ${k}`).join('\n')}`
            : '',
          invalid.length > 0
            ? `Invalid variables:\n${invalid.map((k) => `  - ${k}`).join('\n')}`
            : '',
          '',
          '📝 To fix this:',
          '1. Copy .env.example to .env',
          '2. Fill in all required values',
          '3. Restart the development server',
          '',
          'See SECURITY_SETUP.md for detailed instructions.',
        ]
          .filter(Boolean)
          .join('\n')
      : null;

  return {
    env: {
      // Provide empty-string fallbacks so imports don’t crash; main.tsx will block app startup if invalid.
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID || '',
      VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
      VITE_SENTRY_ENVIRONMENT: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    },
    issues: {
      missing,
      invalid,
      errorMessage,
    },
  };
}

// Validate on module load (non-throwing). The app bootstrap decides whether to proceed.
const validation = validateEnv();
export const env = validation.env;
export const envIssues = validation.issues;
export const envError = validation.issues.errorMessage;

// Prevent accidental import.meta.env usage elsewhere
export function getEnv<K extends keyof Env>(key: K): Env[K] {
  return env[key];
}
