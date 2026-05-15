# Sentry Integration Guide

## Setup Instructions

### 1. Install Sentry Package

```bash
npm install @sentry/react
```

### 2. Get Sentry DSN

1. Go to https://sentry.io and create an account (or login)
2. Create a new project → Select "React"
3. Copy your DSN (looks like: `https://xxx@xxx.ingest.sentry.io/xxx`)

### 3. Add to Environment Variables

Add to your `.env` file:

```bash
VITE_SENTRY_DSN=https://your-dsn-here.ingest.sentry.io/project-id
VITE_SENTRY_ENVIRONMENT=development  # or production, staging
```

Add to `.env.example`:

```bash
# Sentry (optional - for error tracking)
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=development
```

### 4. Update `src/lib/env.ts`

Make Sentry variables optional:

```typescript
// Add to Env interface (optional fields)
VITE_SENTRY_DSN?: string;
VITE_SENTRY_ENVIRONMENT?: string;

// In validateEnv(), add:
VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN || '',
VITE_SENTRY_ENVIRONMENT: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'development',
```

### 5. Initialize in `src/main.tsx`

```typescript
import * as Sentry from "@sentry/react";
import { env } from "@/lib/env";

// Initialize Sentry before rendering
if (env.VITE_SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1, // 10% of transactions
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
    beforeSend(event, hint) {
      // Don't send events in development
      if (import.meta.env.DEV) return null;
      
      // Filter out known non-critical errors
      const error = hint.originalException;
      if (error instanceof Error) {
        if (error.message.includes('ResizeObserver')) return null;
        if (error.message.includes('Network request failed')) return null;
      }
      
      return event;
    },
  });
}
```

### 6. Update `src/lib/logger.ts`

```typescript
private sendToMonitoring(level: LogLevel, message: string, context?: LogContext) {
  // Send to Sentry
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    const Sentry = (window as any).Sentry;
    
    if (level === 'error') {
      const error = context?.error instanceof Error 
        ? context.error 
        : new Error(message);
      
      Sentry.captureException(error, {
        level: 'error',
        extra: context,
      });
    } else if (level === 'warn') {
      Sentry.captureMessage(message, {
        level: 'warning',
        extra: context,
      });
    }
  }
  
  // ... rest of existing code
}
```

### 7. Wrap ErrorBoundary with Sentry

Update `src/App.tsx`:

```typescript
import * as Sentry from "@sentry/react";

// Wrap your app with Sentry ErrorBoundary
function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <QueryClientProvider client={queryClient}>
        {/* ... rest of your app */}
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
}
```

## Features Enabled

✅ **Error Tracking**: Automatic capture of unhandled errors
✅ **Performance Monitoring**: Track slow operations
✅ **Session Replay**: Watch user sessions leading to errors (privacy-safe)
✅ **Breadcrumbs**: See user actions before errors
✅ **Source Maps**: Get original code locations (requires build config)
✅ **User Context**: Identify which users hit errors

## Adding User Context

In `src/contexts/AuthContext.tsx`, after successful login:

```typescript
if (typeof window !== 'undefined' && (window as any).Sentry && session?.user) {
  (window as any).Sentry.setUser({
    id: session.user.id,
    email: session.user.email,
    role: role,
  });
}

// On logout:
if (typeof window !== 'undefined' && (window as any).Sentry) {
  (window as any).Sentry.setUser(null);
}
```

## Production Checklist

Before deploying:

- [ ] Sentry project created
- [ ] DSN added to production environment variables
- [ ] Source maps uploaded (optional but recommended)
- [ ] Alerts configured for critical errors
- [ ] Team members added to Sentry project
- [ ] Tested that errors appear in Sentry dashboard

## Cost Considerations

Sentry has a generous free tier:
- 5,000 errors/month
- 10,000 transactions/month
- 50 replays/month

For production, consider:
- Paid plan if you exceed free tier
- Adjust `tracesSampleRate` to reduce transaction volume
- Filter non-critical errors in `beforeSend`

## Alternative: LogRocket

If you prefer LogRocket instead:

```bash
npm install logrocket logrocket-react
```

See: https://docs.logrocket.com/docs/react

## Manual Installation (if proceeding now)

Run: `npm install @sentry/react`

Then follow steps 3-7 above.
