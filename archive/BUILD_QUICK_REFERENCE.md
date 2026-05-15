# Aqua Prime - Quick Build Guide

**TL;DR version of PRD.md**

---

## 1. First-Time Setup (5 min)

```bash
# Clone & setup
git clone <repo-url>
cd aqua-prime
npm install

# Configure environment
cp .env.example .env
# Edit .env with Supabase & OpenSMS keys
```

**Required .env Variables:**
```bash
VITE_SUPABASE_URL=https://vrhptrtgrpftycvojaqo.supabase.co
VITE_SUPABASE_PROJECT_ID=vrhptrtgrpftycvojaqo
VITE_SUPABASE_PUBLISHABLE_KEY=<from Supabase dashboard>
VITE_OPENSMS_GATEWAY_URL=<your Cloudflare tunnel URL>
OPENSMS_API_KEY=<32-char hex key>
```

**How to Get Supabase Anon Key:**
1. Go to Supabase Dashboard → Project Settings
2. Copy: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Paste as `VITE_SUPABASE_PUBLISHABLE_KEY`
3. That's it! It's safe to keep in code (it's public)

---

## 2. Web Development (5 sec)

```bash
npm run dev
# Open http://localhost:5173
# Hot reload on file changes
```

---

## 3. Web Production Build (2 min)

```bash
npm run build
# Output: dist/ folder
# Deploy dist/ to: Vercel, Netlify, or any host
```

**Deploy to Vercel:**
```bash
npm install -g vercel
vercel --prod
# Done! Auto-deployed at vercel.com dashboard
```

---

## 4. Android Debug APK (10 min - first time, 2 min after)

**Prerequisites:**
```bash
# Android SDK (via Android Studio)
# Or manual: ANDROID_HOME env var set

# Java 17+ (Check: java -version)
```

**Build:**
```bash
npm run build:apk:debug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# Install on phone
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Troubleshoot Android build:**
```bash
# If gradle fails:
cd android && ./gradlew clean && cd ..

# If SDK not found:
export ANDROID_HOME=$HOME/Android/Sdk  # Linux/Mac
set ANDROID_HOME=C:\Users\<YOU>\AppData\Local\Android\Sdk  # Windows

# Verify:
adb --version  # Should show device/USB info
```

---

## 5. Android Release APK (for Google Play Store)

**One-time: Create Signing Key**
```bash
keytool -genkeypair \
  -alias aqua-prime \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -keystore ~/.android/aqua-prime.jks \
  -storepass "YourStorePassword" \
  -keypass "YourKeyPassword" \
  -dname "CN=Aqua Prime,O=Company,C=Country"
```

**Configure Signing (android/local.properties):**
```properties
storeFile=~/.android/aqua-prime.jks
storePassword=YourStorePassword
keyAlias=aqua-prime
keyPassword=YourKeyPassword
```

**Build:**
```bash
npm run build:apk:release
# Output: android/app/build/outputs/apk/release/app-release.apk
# Or for Google Play: android/app/build/outputs/bundle/release/app-release.aab
```

---

## 6. iOS Build (Mac Only, 15 min)

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios

# In Xcode:
# 1. Select Team ID (Signing & Capabilities tab)
# 2. Build: Cmd+B
# 3. Archive: Product → Archive
# 4. Export → Save
```

---

## 7. How Supabase Anon Key & RLS Work

### Anon Key = "Public Passport"

```
┌─────────────────────────────────────┐
│ SAFE TO EXPOSE (put in .env)        │
├─────────────────────────────────────┤
│ VITE_SUPABASE_PUBLISHABLE_KEY       │ ← Can be in code
│ (Also called: Anon Key)              │
│                                     │
│ What it does:                        │
│ ✅ Can query public data             │
│ ✅ Cannot access private tables      │
│ ✅ Scope limited by RLS policies     │
│ ✅ User authenticated via JWT        │
└─────────────────────────────────────┘
```

### RLS = "Fine-Grained Access Control"

```sql
-- Example: Users can only see their own data
CREATE POLICY "user_self_access"
ON profiles FOR SELECT
USING (auth.uid() = user_id);

-- Example: Agents can see assigned stores
CREATE POLICY "agent_store_access"
ON store_assignments FOR SELECT
USING (
  auth.uid() = agent_user_id AND
  current_timestamp < expires_at
);
```

**Key Points:**
- ✅ Anon key is PUBLIC (safe in frontend)
- ❌ Service role key is PRIVATE (never expose)
- ✅ RLS policies enforce what users can access
- ✅ JWT token attached to requests = identifies user
- ✅ Database checks RLS before returning data

---

## 8. Testing Before Release

```bash
# Run all tests
npm run verify:build

# Includes:
# - Linting
# - Unit tests
# - Production build
# All in one command
```

---

## 9. Common Commands

```bash
npm run dev              # Start dev server
npm run build            # Build for web
npm run build:apk:debug  # Android debug
npm run build:apk:release # Android release
npm run build:android    # Full pipeline (build → sync → gradle)
npm run lint             # Check code quality
npm run test             # Run unit tests
npm run preview          # Preview production build locally
```

---

## 10. Deployment Destinations

| Platform | Build | Command | Time |
|----------|-------|---------|------|
| **Web** | Browser/PWA | `npm run build` then deploy `dist/` | 1 min |
| **Vercel** | Auto | `vercel --prod` | 2 min |
| **Android** | Google Play | `npm run build:apk:release` then upload | 10 min |
| **iOS** | App Store | `npx cap open ios` then Xcode | 15 min |

---

## 11. Emergency Fixes

**"Build fails with permission denied"**
```bash
# Windows with spaces in path?
# Solution: Copy to path without spaces (C:\opensms-build)
# Then build from there
```

**"Gradle can't find SDK"**
```bash
# Set environment variable permanently
# Windows: System → Environment Variables → ANDROID_HOME
# Mac/Linux: Add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
```

**"APK not installing"**
```bash
# Check app isn't already running
adb shell pm list packages | grep opensms

# Uninstall old version
adb uninstall dev.opensms

# Reinstall
adb install app-debug.apk
```

---

## Next Steps

1. ✅ **Setup:** Run `npm install`
2. ✅ **Configure:** Update `.env`
3. ✅ **Dev:** `npm run dev` and test
4. ✅ **Build:** `npm run build:apk:debug` for Android
5. ✅ **Release:** `npm run build:apk:release` for Play Store
6. ✅ **Deploy:** App Store / Google Play Console

Done! 🚀
