# Aqua Prime - Product Requirements Document (PRD)

**Version:** 1.0
**Last Updated:** March 26, 2026
**Status:** In Development

---

## 1. Executive Summary

**Aqua Prime** is a multi-role, location-based commerce platform with:
- **Web Dashboard** - Staff, managers, and admin controls
- **Mobile App** (Android/iOS) - For agents, marketers, and customers
- **Phone Authentication** - OpenSMS-based OTP verification
- **Real-time Sync** - Offline-first with Supabase integration
- **Role-Based Access Control (RBAC)** - 6 distinct user roles

### Key Features
- SMS-based OTP authentication (OpenSMS Gateway)
- Multi-language support
- Offline queue for API requests
- Geolocation tracking for agents/routes
- Customer profile & transaction history
- Store & product management
- Real-time notifications

---

## 2. System Architecture

### 2.1 Technology Stack

```
Frontend:
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + Radix UI (component library)
- React Router (navigation)
- TanStack Query (data fetching)
- Zustand (state management)

Backend:
- Supabase (PostgreSQL + Auth + Storage)
- Edge Functions (Deno runtime)
- PostgreSQL RLS (Row Level Security)

Mobile:
- Capacitor 8 (React web → native wrapper)
- Android 26+ (API level 26+)

Authentication:
- Supabase Auth (custom providers)
- OpenSMS Gateway (phone OTP)
- Firebase Phone Auth (fallback)
```

### 2.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interface Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  Web Dashboard          │ Mobile App (Capacitor)                 │
│  ├─ Staff/Manager       │ ├─ Agent App                          │
│  ├─ Admin Views         │ ├─ Marketer App                       │
│  └─ Analytics           │ └─ Customer Portal                    │
└──────────────┬──────────────────────────────────────┬───────────┘
               │                                      │
               ▼                                      ▼
    ┌─────────────────────────────┐      ┌──────────────────────┐
    │  Supabase JavaScript SDK    │      │ Capacitor Plugins    │
    │  (@supabase/supabase-js)    │      │ - Geolocation       │
    └──────────────┬──────────────┘      │ - Camera            │
                   │                      │ - Storage           │
               ┌───┴────────────────────────┴──────────────────┐
               │                                               │
               ▼                                               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │           Supabase Backend as a Service                    │
    ├─────────────────────────────────────────────────────────────┤
    │  ├─ PostgreSQL Database (with RLS policies)                │
    │  ├─ Auth Service (Email/Phone/OAuth)                       │
    │  ├─ Edge Functions (Deno runtime)                          │
    │  ├─ Realtime (WebSocket subscriptions)                     │
    │  ├─ Storage (File uploads)                                 │
    │  └─ Vector DB (Embeddings)                                 │
    └─────────────────────────────────────────────────────────────┘
               │
            ┌──┴──────────────────────────┐
            │                             │
            ▼                             ▼
    ┌──────────────────────┐    ┌──────────────────────┐
    │  OpenSMS Gateway     │    │  Firebase Auth       │
    │  (Phone OTP)         │    │  (Fallback)          │
    │  Port: 8080/HTTP     │    │                      │
    └──────────────────────┘    └──────────────────────┘
            │
            ▼
    ┌──────────────────────┐
    │  Mobile Carrier SMS  │
    └──────────────────────┘
```

### 2.3 User Roles & Permissions

| Role | Web | Mobile | Permissions |
|------|-----|--------|-------------|
| **super_admin** | ✅ | ❌ | All system management |
| **manager** | ✅ | ❌ | Store/staff/inventory management |
| **agent** | ❌ | ✅ | Route execution, customer interactions |
| **marketer** | ❌ | ✅ | Campaign/promotion management |
| **pos** | ✅ | ❌ | Point of sale transactions |
| **customer** | ❌ | ✅ | View own profile/transactions |

---

## 3. Configuration & Setup

### 3.1 Environment Variables

Create `.env` file in project root with:

```bash
# Supabase Configuration
VITE_SUPABASE_URL="https://vrhptrtgrpftycvojaqo.supabase.co"
VITE_SUPABASE_PROJECT_ID="vrhptrtgrpftycvojaqo"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# OpenSMS Configuration (Phone OTP)
VITE_OPENSMS_GATEWAY_URL="https://your-tunnel-url.trycloudflare.com"
OPENSMS_API_KEY="your-32-char-hex-key"

# Firebase Configuration (Fallback Auth)
VITE_FIREBASE_API_KEY="AIzaSyCngbWt92ZlOXNeAk3DHLXncWOjwZ_Xu7Y"
VITE_FIREBASE_AUTH_DOMAIN="aqua-prime-auth.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="aqua-prime-auth"
VITE_FIREBASE_APP_ID="1:648044405229:android:54c85efd091328..."

# Sentry Configuration (Error tracking)
VITE_SENTRY_DSN="https://xxx@yyy.ingest.sentry.io/zzz"

# App Configuration
VITE_APP_ENV="production" # or "development"
VITE_API_TIMEOUT="30000"
```

### 3.2 Supabase Anon Key Configuration

**What is the Anon Key?**
- Public key that can be safely exposed in frontend code
- Used for unauthenticated API calls
- Restricted by Row Level Security (RLS) policies
- Cannot access sensitive data without authentication

**Understanding RLS (Row Level Security):**
```sql
-- Example: Customers can only see their own profile
CREATE POLICY "Customers see own profile"
ON profiles FOR SELECT
USING (auth.uid() = user_id);

-- Example: Agents can see store assignments
CREATE POLICY "Agents see assigned stores"
ON store_assignments FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM store_assignments
    WHERE store_id = store_assignments.store_id
  )
);
```

**Key Security Rules:**
- ✅ Anon key can be public (in .env.example)
- ❌ Service role key = NEVER commit to repo
- ✅ RLS policies enforce data access
- ✅ JWT from Supabase Auth is scoped to user

**Setting Supabase Secrets for Edge Functions:**
```bash
# Access Supabase Dashboard → Project Settings → Secrets

# Set API keys for OpenSMS
supabase secrets set OPENSMS_GATEWAY_URL "https://..."
supabase secrets set OPENSMS_API_KEY "your-key"

# Done via dashboard or CLI
```

---

## 4. How the App Works

### 4.1 Authentication Flow

```
User provides phone → OTP sent via SMS → User enters OTP → Account created/Updated
                    ↓
            OpenSMS receives request
            (managed by Edge Function)
                    ↓
            SMS sent via phone's SIM
                    ↓
            User receives OTP
                    ↓
            Edge Function verifies OTP
                    ↓
            Supabase Auth tokens issued
                    ↓
            User logged in
```

**Edge Function: `send-otp-opensms`**
```typescript
// Request
POST /functions/v1/send-otp-opensms
{
  "phone": "+919876543210"
}

// Response
{
  "success": true,
  "phone": "***543210",
  "session_token": "abc123def456",
  "otp_for_dev": "482910" // DEV ONLY
}
```

**Edge Function: `verify-otp-opensms`**
```typescript
// Request
POST /functions/v1/verify-otp-opensms
{
  "session_token": "abc123def456",
  "otp_code": "482910"
}

// Response
{
  "success": true,
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user": { ... }
}
```

### 4.2 Data Flow

```
1. User logs in via phone OTP
   ↓
2. Supabase creates Auth session + JWT token
   ↓
3. JWT attached to all API requests (via SDK)
   ↓
4. PostgreSQL RLS checks policy for each query
   ↓
5. Only authorized data returned
   ↓
6. App updates React state + local cache
   ↓
7. UI renders based on user role & data
```

### 4.3 Offline Support

```
Online:
- Query Supabase directly
- Update local cache (TanStack Query)
- Sync real-time subscriptions

Offline:
- Read from local cache
- Queue mutations in offlineQueue
- Show "Queued" indicator

Back Online:
- Process queued mutations
- Sync with server
- Update UI with fresh data
```

---

## 5. Build Instructions

### 5.1 Prerequisites

**Windows/Mac/Linux:**
```bash
# Node.js 18+ (https://nodejs.org/)
node --version  # should be v18.0.0 or higher

# npm (comes with Node.js)
npm --version

# Git
git --version

# Supabase CLI (for local development)
npm install -g supabase
```

**Additional for Android:**
```bash
# Android Studio (https://developer.android.com/studio)
# - Includes Android SDK
# - Also install: SDK Platform 26, 34, 35

# Or manual setup:
# - Android SDK: $ANDROID_HOME/platforms/android-34
# - NDK: $ANDROID_HOME/ndk/26.0.10792818
```

**Additional for iOS (Mac only):**
```bash
# Xcode 15+ (from App Store or https://developer.apple.com/xcode/)

# CocoaPods
sudo gem install cocoapods
```

### 5.2 Clone & Setup

```bash
# Clone repository
git clone https://github.com/yourrepo/aqua-prime.git
cd aqua-prime

# Install Node dependencies
npm install

# Create .env from template
cp .env.example .env

# Update .env with your Supabase credentials
nano .env  # or use your editor
```

### 5.3 Web Build (Desktop/Browser)

**Development:**
```bash
# Start dev server (http://localhost:5173)
npm run dev

# Open browser and test:
# Login with phone OTP
# Try different roles (agent, manager, customer)
```

**Production Build:**
```bash
# Build optimized bundle
npm run build

# Output in: dist/

# Preview build locally
npm run preview
# Open http://localhost:4173

# Deploy to production
# Option A: Vercel (recommended)
npm install -g vercel
vercel --prod

# Option B: Docker
docker build -t aqua-prime:latest .
docker run -p 3000:3000 aqua-prime:latest

# Option C: Traditional hosting (Netlify, AWS, GCP, etc.)
# Copy dist/ folder to hosting provider
```

### 5.4 Android Build

#### Step 1: Setup Android SDK Path

**Windows (PowerShell):**
```powershell
# Add to $PROFILE
$env:ANDROID_HOME = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\cmdline-tools\latest\bin"
$env:PATH += ";$env:ANDROID_HOME\platform-tools"
$env:PATH += ";$env:ANDROID_HOME\emulator"

# Verify
adb --version
```

**Mac/Linux (Bash):**
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin

# Reload
source ~/.bashrc

# Verify
adb --version
```

#### Step 2: Build Web Assets

```bash
# From project root
npm run build
```

#### Step 3: Sync with Capacitor

```bash
# Install Capacitor dependencies
npm install @capacitor/cli @capacitor/core @capacitor/android

# Sync web build to Android project
npx cap sync android

# This copies:
# - dist/ → android/app/src/main/assets/public
# - Capacitor plugins → android/
```

#### Step 4: Build APK

**Debug APK** (for testing):
```bash
# Automatic (recommended)
npm run build:apk:debug
# Equivalent to: npm run build && npx cap sync android && cd android && ./gradlew assembleDebug

# Or manual
cd android
./gradlew assembleDebug
cd ..

# Output: android/app/build/outputs/apk/debug/app-debug.apk
# Install on device: adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Release APK** (for Google Play Store):
```bash
# Step 1: Create signing keystore (one time only)
keytool -genkeypair \
  -alias aqua-prime \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore ~/.android/aqua-prime.jks \
  -storepass "YourStorePassword" \
  -keypass "YourKeyPassword" \
  -dname "CN=Aqua Prime,O=Your Company,L=City,ST=State,C=Country"

# Step 2: Create signing configuration
cat > android/local.properties << EOF
storeFile=$HOME/.android/aqua-prime.jks
storePassword=YourStorePassword
keyAlias=aqua-prime
keyPassword=YourKeyPassword
EOF

# Step 3: Build release APK
npm run build:apk:release

# Output: android/app/build/outputs/apk/release/app-release.apk
```

**Bundle for Google Play** (preferred method):
```bash
# Build AAB (Android App Bundle)
cd android
./gradlew bundleRelease
cd ..

# Output: android/app/build/outputs/bundle/release/app-release.aab
# Upload to Google Play Console
```

#### Step 5: Install on Device

```bash
# List connected devices
adb devices

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or via Android Studio
# - Connect phone via USB
# - Enable USB Debugging (Developer Options)
# - Run → Run 'app'
```

### 5.5 iOS Build (Mac Only)

```bash
# Step 1: Install CocoaPods dependencies
npm install @capacitor/ios
npx cap add ios
npx cap sync ios

# Step 2: Open in Xcode
npx cap open ios

# Step 3: In Xcode
# - Select target "aqua-prime"
# - Select your Team ID (Signing & Capabilities)
# - Build Settings → set appropriate SDK

# Step 4: Build
# Option A: Through Xcode UI
#   - Xcode → Product → Build
#   - Product → Archive → Export

# Option B: Command line
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  archive -archivePath build/App.xcarchive

# Step 5: Submit to App Store (if released)
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist exportOptions.plist \
  -exportPath build/ipa
```

### 5.6 Testing Before Release

```bash
# Unit tests
npm run test

# Test coverage
npm run test:coverage

# Linting
npm run lint

# Full verification (before before release)
npm run verify:build
```

---

## 6. Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No console errors/warnings
- [ ] RLS policies configured correctly
- [ ] Edge Functions deployed to Supabase
- [ ] Environment variables set
- [ ] Analytics/Sentry configured

### Web Deployment

```bash
# Vercel (recommended)
npm install -g vercel
vercel --prod

# Or build locally
npm run build
# Deploy dist/ folder
```

### Mobile Deployment

**Android (Google Play Store):**
```bash
# Step 1: Create release APK
npm run build:apk:release

# Step 2: Upload to Google Play Console
# - Go to google.play.com/console
# - Select app
# - Release → Create Release
# - Upload AAB or APK
# - Fill store listing, privacy policy, etc.
# - Submit for review (1-3 hours)
```

**iOS (App Store):**
```bash
# Step 1: Build and archive in Xcode
npx cap open ios

# Step 2: Upload to App Store Connect
# - Xcode → Product → Archive
# - Distribute App
# - App Store → Upload

# Step 3: Submit for review
# - App Store Connect → My Apps
# - Version Release → Submit for Review
```

---

## 7. Troubleshooting

### Build Errors

**`npm install` fails:**
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Android SDK not found:**
```bash
# Verify SDK path
echo $ANDROID_HOME  # Should output SDK path

# If not set:
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```

**Gradle build fails:**
```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
```

### Runtime Errors

**"Supabase connection failed":**
```
Check:
1. VITE_SUPABASE_URL is correct
2. Network is connected
3. RLS policies allow user access
4. Auth session is valid (check browser console)
```

**"OpenSMS gateway unreachable":**
```
Check:
1. Cloudflare Tunnel is running on phone
2. VITE_OPENSMS_GATEWAY_URL is correct tunnel URL
3. Phone has internet connection
4. Firewall not blocking tunnel
```

---

## 8. Performance Optimization

### Web

```bash
# Check bundle size
npm run build
# Analyze with: npm install -g webpack-bundle-analyzer

# Lighthouse audit
# Chrome DevTools → Lighthouse tab

# Recommended targets:
# - Largest Contentful Paint (LCP): < 2.5s
# - First Input Delay (FID): < 100ms
# - Cumulative Layout Shift (CLS): < 0.1
```

### Mobile

```bash
# Android performance profiling
# Android Studio → Profiler
# Tools → Device File Explorer

# iOS performance profiling
# Xcode → Debug → Gauges
```

---

## 9. Security Best Practices

✅ **DO:**
- Store `VITE_SUPABASE_PUBLISHABLE_KEY` in version control (it's public)
- Use HTTPS everywhere
- Validate all user input on backend
- Implement RLS on all tables
- Enable 2FA for admin accounts
- Rotate API keys regularly

❌ **DON'T:**
- Commit `.env.local` to git
- Expose Service Role Key
- Store sensitive data in localStorage (use Supabase Auth session)
- Trust client-side validation alone
- Disable RLS
- Use default admin credentials

---

## 10. Support & Resources

- **Supabase Docs:** https://supabase.com/docs
- **React Router:** https://reactrouter.com/
- **Capacitor:** https://capacitorjs.com/
- **Android Gradle:** https://gradle.org/
- **OpenSMS:** https://opensms.io/

---

## Appendix: Scripts Reference

```bash
npm run dev              # Start dev server
npm run build            # Build web
npm run build:dev        # Build with development mode
npm run build:android    # Build for Android (full pipeline)
npm run build:apk:debug  # Build debug APK only
npm run build:apk:release # Build release APK only
npm run lint             # Run ESLint
npm run test             # Run tests
npm run verify:build     # Full verification pipeline
npm run preview          # Preview production build locally
```
