import { describe, it, expect, beforeEach } from 'vitest';

// Mock environment for tests
beforeEach(() => {
  // Set up valid test environment
  import.meta.env.VITE_SUPABASE_URL = 'https://test-project.supabase.co';
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key';
  import.meta.env.VITE_SUPABASE_PROJECT_ID = 'test-project';
  import.meta.env.VITE_FIREBASE_API_KEY = 'test-firebase-key';
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
  import.meta.env.VITE_FIREBASE_PROJECT_ID = 'test-firebase';
  import.meta.env.VITE_FIREBASE_APP_ID = 'test-app-id';
});

describe('Environment Validation', () => {
  it('should throw error when VITE_SUPABASE_URL is missing', () => {
    import.meta.env.VITE_SUPABASE_URL = '';
    
    expect(() => {
      // Re-import to trigger validation
      delete require.cache[require.resolve('@/lib/env')];
      require('@/lib/env');
    }).toThrow(/Missing variables/);
  });

  it('should throw error for placeholder values', () => {
    import.meta.env.VITE_SUPABASE_URL = 'https://your_project_id_here.supabase.co';
    
    expect(() => {
      delete require.cache[require.resolve('@/lib/env')];
      require('@/lib/env');
    }).toThrow(/placeholder value/);
  });

  it('should throw error for non-HTTPS Supabase URL', () => {
    import.meta.env.VITE_SUPABASE_URL = 'http://insecure.supabase.co';
    
    expect(() => {
      delete require.cache[require.resolve('@/lib/env')];
      require('@/lib/env');
    }).toThrow(/must start with https/);
  });

  it('should validate all required fields are present', () => {
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PROJECT_ID',
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ];

    for (const key of required) {
      const original = import.meta.env[key];
      import.meta.env[key] = '';
      
      expect(() => {
        delete require.cache[require.resolve('@/lib/env')];
        require('@/lib/env');
      }).toThrow(new RegExp(key));
      
      import.meta.env[key] = original;
    }
  });
});
