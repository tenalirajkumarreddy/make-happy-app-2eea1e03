# 🚀 Deployment Guide

## Quick Links

- **Web App**: Deployed on Vercel
- **Android APK**: Manual deployment to Google Play Store
- **Supabase**: Database and backend services
- **Firebase**: Customer phone authentication

---

## Prerequisites

Before deploying:

- [ ] All production readiness issues resolved (see PRODUCTION_READY.md)
- [ ] Environment variables configured (see ENVIRONMENT_CONFIG.md)
- [ ] Version bumped (see VERSIONING.md)
- [ ] Tests passing (`npm run test`)
- [ ] Build successful (`npm run build`)
- [ ] Credentials rotated if previously exposed (see SECURITY_SETUP.md)

---

## Web Deployment (Vercel)

### Initial Setup

1. **Connect Repository**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Login
   vercel login
   
   # Link project (run from project root)
   vercel link
   ```

2. **Configure Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from `.env.example`
   - Set to "Production" environment
   
   Required variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_SENTRY_DSN` (optional)

3. **Deploy**
   ```bash
   # Production deployment
   vercel --prod
   ```

### Automatic Deployments

After initial setup, Vercel auto-deploys:
- **Production**: Pushes to `main` branch
- **Preview**: Pull requests and other branches

### Manual Deployment

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

### Rollback

```bash
# List deployments
vercel list

# Rollback to specific deployment
vercel rollback <deployment-url>
```

---

## Android Deployment

### Debug Build (Testing)

```bash
npm run build:apk:debug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release Build (Production)

1. **Ensure `.env.production` exists** with production values

2. **Build signed APK**
   ```bash
   npm run build:apk:release
   ```

3. **Sign APK** (if not auto-signed)
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### Google Play Store

#### First-Time Setup

1. **Create Google Play Developer Account**
   - Go to https://play.google.com/console
   - Pay one-time $25 registration fee

2. **Create App**
   - Click "Create App"
   - App name: "Aqua Prime" (or your brand)
   - Package name: `com.aquaprime.app`

3. **Complete Store Listing**
   - Short description (80 chars max)
   - Full description
   - App icon (512x512 PNG)
   - Feature graphic (1024x500 PNG)
   - Screenshots (at least 2, max 8)
   - Privacy policy URL

4. **Upload APK**
   - Go to "Release" → "Production"
   - Click "Create Release"
   - Upload `app-release.apk`
   - Add release notes
   - Review and rollout

#### Subsequent Releases

1. **Bump version** in `android/app/build.gradle`:
   ```gradle
   versionCode = 2  // Increment
   versionName = "1.0.1"  // Match package.json
   ```

2. **Build release APK**
   ```bash
   npm run build:apk:release
   ```

3. **Upload to Play Store**
   - Go to "Release" → "Production"
   - Create new release
   - Upload APK
   - Add release notes
   - Submit for review

#### Release Tracks

- **Internal Testing**: For team testing (instant)
- **Closed Testing**: For beta testers (instant)
- **Open Testing**: Public beta (instant)
- **Production**: Live to all users (review required, 1-7 days)

Recommended flow:
1. Internal testing first
2. Closed beta with key users
3. Production rollout to 10% → 50% → 100%

---

## Supabase Deployment

### Migrations

```bash
# Apply all pending migrations to production
npx supabase db push --project-ref <your-prod-project-ref>

# Or using Supabase CLI linked project
npx supabase db push
```

### Edge Functions

```bash
# Deploy all edge functions
npx supabase functions deploy

# Deploy specific function
npx supabase functions deploy invite-staff

# Deploy with environment secrets
npx supabase secrets set FIREBASE_PROJECT_ID=<value>
```

### Scheduled Functions

Set up cron jobs in Supabase Dashboard → Edge Functions → Cron:

- `daily-store-reset`: `0 0 * * *` (midnight daily)
- `daily-handover-snapshot`: `0 23 * * *` (11pm daily)
- `auto-orders`: `0 6 * * *` (6am daily)

---

## Domain Setup

### Vercel Custom Domain

1. **Add Domain in Vercel**
   - Project Settings → Domains
   - Add your domain (e.g., `app.aquaprime.com`)

2. **Configure DNS**
   - Add CNAME record: `app` → `cname.vercel-dns.com`
   - Or A record to Vercel IPs

3. **SSL Certificate**
   - Auto-issued by Vercel (Let's Encrypt)

### Supabase Custom Domain (Optional)

1. Go to Project Settings → Custom Domains
2. Add custom domain
3. Update DNS records as instructed
4. Update `VITE_SUPABASE_URL` in environment variables

---

## Monitoring & Alerts

### Vercel

- **Analytics**: Built-in analytics in Vercel dashboard
- **Logs**: Real-time logs in Vercel dashboard → Deployments → Logs
- **Alerts**: Set up via Vercel Integrations (Slack, Discord, email)

### Supabase

- **Database**: Dashboard → Database → Activity
- **Logs**: Dashboard → Logs Explorer
- **Alerts**: Dashboard → Reports (email alerts for errors)

### Sentry (if configured)

- **Errors**: https://sentry.io → Your Project
- **Alerts**: Configure in Sentry → Alerts
- **Performance**: Sentry → Performance tab

---

## Health Checks

### Pre-Deployment

```bash
# Run full verification
npm run verify:build

# Individual checks
npm run lint
npm test
npm run build
```

### Post-Deployment

1. **Web App**
   - Visit production URL
   - Test critical flows:
     - Staff login (email/password)
     - Customer login (phone OTP)
     - Record a sale
     - View reports
   - Check console for errors (F12)

2. **Android App**
   - Install release APK on test device
   - Test all user roles
   - Test offline sync
   - Test camera/GPS permissions

3. **Backend**
   - Check Supabase logs for errors
   - Verify edge functions are running
   - Test RLS policies (try unauthorized actions)

---

## Rollback Procedures

### Web (Vercel)

```bash
# Instant rollback to previous deployment
vercel rollback
```

Or in Vercel Dashboard → Deployments → Click previous deployment → "Promote to Production"

### Android

- Cannot rollback APK on users' devices
- Can rollback staged rollout percentage in Play Console
- Can unpublish app (removes from store)
- Can push hotfix as new version

### Database (Supabase)

```bash
# Rollback last migration
npx supabase db reset --project-ref <prod-ref>

# Or restore from backup (manual in Dashboard)
```

⚠️ **Database rollbacks can cause data loss. Always test in staging first!**

---

## Hotfix Process

For critical production bugs:

```bash
# 1. Create hotfix branch from production tag
git checkout -b hotfix/1.0.1 v1.0.0

# 2. Make fix and test
npm test
npm run build

# 3. Bump patch version
npm version patch

# 4. Merge to main
git checkout main
git merge hotfix/1.0.1

# 5. Deploy immediately
vercel --prod  # Web
npm run build:apk:release  # Android (if needed)

# 6. Push changes
git push origin main --tags
```

---

## Scheduled Maintenance

### Database Maintenance

- **Backups**: Automatic daily backups in Supabase (retained 7 days on free tier)
- **Vacuum**: Manual vacuum recommended monthly (Supabase Dashboard → Database → Vacuum)

### Dependency Updates

```bash
# Check for updates
npm outdated

# Update all (be careful with major versions)
npm update

# Test after updates
npm test
npm run build
```

Recommended schedule: Monthly security updates, quarterly major version updates.

---

## Disaster Recovery

### Data Loss

1. **Supabase Backup Restore**
   - Dashboard → Database → Backups
   - Select backup → Restore

2. **Point-in-Time Recovery** (paid plans only)
   - Dashboard → Database → Point-in-time recovery

### Service Outage

- **Vercel**: Check https://vercel-status.com
- **Supabase**: Check https://status.supabase.com
- **Firebase**: Check https://status.firebase.google.com

### Emergency Contacts

- Supabase Support: support@supabase.com
- Vercel Support: support@vercel.com (paid plans)
- Firebase Support: https://firebase.google.com/support

---

## Checklist

Before each deployment:

### Pre-Deployment
- [ ] Tests pass
- [ ] Linter passes
- [ ] Build succeeds
- [ ] Version bumped
- [ ] CHANGELOG updated
- [ ] Environment variables verified
- [ ] Database migrations tested in staging

### Deployment
- [ ] Web deployed to Vercel
- [ ] APK built for Android (if needed)
- [ ] Edge functions deployed
- [ ] Database migrations applied

### Post-Deployment
- [ ] Web app loads without errors
- [ ] Critical user flows tested
- [ ] Monitoring dashboards checked
- [ ] Team notified
- [ ] Documentation updated (if needed)

### Emergency Rollback Plan
- [ ] Previous deployment URL bookmarked
- [ ] Database backup confirmed
- [ ] Rollback procedure documented
- [ ] Team knows how to execute rollback

---

## Support

For deployment issues:

1. Check logs:
   - Vercel: Dashboard → Logs
   - Supabase: Dashboard → Logs Explorer
   - Browser: F12 → Console

2. Common issues:
   - **Build fails**: Check environment variables
   - **App errors**: Check Sentry/logs
   - **Database errors**: Check RLS policies, migrations
   - **Auth issues**: Check Supabase Auth settings

3. Get help:
   - Vercel Community: https://github.com/vercel/vercel/discussions
   - Supabase Discord: https://discord.supabase.com
   - Project documentation: This guide + AGENTS.md
