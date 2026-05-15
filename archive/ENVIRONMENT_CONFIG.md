# Environment-Specific Configuration

## Overview

The app supports multiple environments with different configurations:

- **Development** (`npm run dev`)
- **Staging** (optional, `npm run build:staging`)
- **Production** (`npm run build`)

## Environment Files

### `.env` (Development - git-ignored)
```bash
VITE_SUPABASE_PROJECT_ID=dev_project_id
VITE_SUPABASE_URL=https://dev-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=dev_anon_key

VITE_FIREBASE_API_KEY=dev_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=dev-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dev-firebase-project
VITE_FIREBASE_APP_ID=dev_firebase_app_id

# Optional
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=development
```

### `.env.production` (git-ignored)
```bash
VITE_SUPABASE_PROJECT_ID=prod_project_id
VITE_SUPABASE_URL=https://prod-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=prod_anon_key

VITE_FIREBASE_API_KEY=prod_firebase_key
VITE_FIREBASE_AUTH_DOMAIN=prod-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prod-firebase-project
VITE_FIREBASE_APP_ID=prod_firebase_app_id

VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
VITE_SENTRY_ENVIRONMENT=production
```

### `.env.staging` (optional, git-ignored)
```bash
VITE_SUPABASE_PROJECT_ID=staging_project_id
VITE_SUPABASE_URL=https://staging-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=staging_anon_key

# ... rest of staging config
VITE_SENTRY_ENVIRONMENT=staging
```

## Usage

### Development
```bash
npm run dev
# Loads .env
```

### Production Build
```bash
npm run build
# Automatically loads .env.production (if exists) or falls back to .env
```

### Staging Build (if configured)
```bash
npm run build -- --mode staging
# Loads .env.staging
```

## Vercel Deployment

### Automatic (Recommended)

1. Go to Vercel project → Settings → Environment Variables
2. Add production variables
3. Vercel automatically uses them during build

### Environment-Specific Variables in Vercel

| Variable | Environment | Value |
|----------|-------------|-------|
| `VITE_SUPABASE_URL` | Production | `https://prod.supabase.co` |
| `VITE_SUPABASE_URL` | Preview | `https://staging.supabase.co` |
| `VITE_SUPABASE_URL` | Development | `https://dev.supabase.co` |

## Android APK Builds

### Debug (uses development env)
```bash
npm run build:apk:debug
# Uses .env by default
```

### Release (uses production env)
```bash
# Make sure .env.production exists with prod values
npm run build:apk:release
```

**Important:** APKs bake in environment variables at build time. Ensure correct `.env.production` exists before building release APK.

## Best Practices

### ✅ DO

- Use separate Supabase projects for dev/staging/prod
- Keep `.env.production` with production-only values
- Test builds in staging before production
- Use Vercel environment variables for web deployment
- Version control `.env.example` only

### ❌ DON'T

- Commit `.env`, `.env.production`, or `.env.staging` to git
- Use production credentials in development
- Share the same database across environments
- Hardcode environment-specific values in code

## Environment Detection

In code, detect the environment:

```typescript
const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;
const mode = import.meta.env.MODE; // 'development' | 'production' | 'staging'

if (isProduction) {
  // Production-only code
  initAnalytics();
}
```

## Supabase Environment Setup

### Development
1. Create Supabase project "bizmanager-dev"
2. Run migrations: `npx supabase db push`
3. Copy anon key to `.env`

### Production
1. Create Supabase project "bizmanager-prod"
2. Run migrations: `npx supabase db push --project-ref prod-project-ref`
3. Copy anon key to `.env.production`

## Firebase Environment Setup

### Development
1. Create Firebase project "bizmanager-dev"
2. Add Android app with package: `com.aquaprime.app.dev`
3. Download `google-services.json`
4. Place in `android/app/src/dev/`

### Production
1. Create Firebase project "bizmanager-prod"
2. Add Android app with package: `com.aquaprime.app`
3. Download `google-services.json`
4. Place in `android/app/`

## Troubleshooting

### Build uses wrong environment
```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run build
```

### Environment variables not loading
```bash
# Ensure file naming is correct
ls -la .env*

# Expected:
# .env                  (dev)
# .env.production       (prod)
# .env.example          (template)
```

### Android APK using dev credentials
- Ensure `.env.production` exists
- Rebuild: `npm run build && npm run build:apk:release`
- Check build logs for loaded environment

## Security Notes

⚠️ **All VITE_* variables are publicly accessible in the built client bundle.**

Never put sensitive keys (service role keys, private keys) in VITE_* variables. Use:
- Edge Functions for server-side operations
- RLS policies for database security
- Supabase Auth for user authentication

## Checklist

Before deploying:

- [ ] Development environment configured
- [ ] Production environment variables added to Vercel
- [ ] Separate Supabase projects created
- [ ] Separate Firebase projects created
- [ ] `.env.example` updated with all variables
- [ ] `.gitignore` includes `.env*` (except `.env.example`)
- [ ] Production credentials tested
- [ ] Staging environment set up (optional)
