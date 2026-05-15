# Security Setup Guide

## 🚨 IMMEDIATE ACTION REQUIRED

Your `.env` file was not in `.gitignore` and may have been committed to Git. Follow these steps:

---

## Step 1: Check if Credentials Were Exposed

```bash
# Check if .env was ever committed
git log --all --full-history -- .env

# If you see commits, your credentials are in Git history
```

**If credentials were committed:**
- They are permanently in Git history
- Anyone who cloned the repo has access to them
- You MUST rotate all keys immediately

---

## Step 2: Rotate All Keys (REQUIRED if .env was committed)

### Supabase Keys
1. Go to https://app.supabase.com/project/vrhptrtgrpftycvojaqo/settings/api
2. Click "Reset API Keys" → Confirm
3. Update your `.env` file with new keys
4. Redeploy all applications using the old keys

### Firebase Keys
1. Go to https://console.firebase.google.com/project/aqua-prime-auth/settings/general
2. Delete the existing app registration
3. Create a new app
4. Update your `.env` with the new credentials

---

## Step 3: Remove .env from Git History

**⚠️ WARNING: This rewrites Git history. Coordinate with your team first!**

```bash
# Remove .env from all commits
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (requires coordination with team)
git push origin --force --all
git push origin --force --tags
```

**Alternative (if team coordination is difficult):**
1. Rotate all keys (Step 2)
2. Leave history as-is but treat old keys as compromised
3. Monitor for unauthorized access

---

## Step 4: Set Up Environment Variables Properly

### Development
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your development credentials
3. Never commit `.env` to Git

### Production (Vercel)
1. Go to https://vercel.com/[your-project]/settings/environment-variables
2. Add each variable from `.env.example`
3. Use production Supabase project (NOT the same as dev)

### Production (Android APK)
The app will use environment variables baked into the build:
```bash
# Make sure .env has PRODUCTION values before building
npm run build:apk:release
```

**Best Practice:** Use separate Supabase projects for dev/staging/prod

---

## Step 5: Verify Security

```bash
# Ensure .env is ignored
git check-ignore .env
# Should output: .env

# Ensure .env is not staged
git status
# Should NOT show .env
```

---

## Going Forward

### ✅ DO
- Use `.env.example` for templates
- Keep `.env` in `.gitignore`
- Use separate credentials per environment
- Rotate keys regularly (every 90 days)

### ❌ DON'T
- Commit `.env` to Git
- Share credentials in Slack/Email
- Use production keys in development
- Hardcode credentials in source code

---

## Monitoring

After rotating keys:
1. Monitor Supabase logs for unauthorized access
2. Set up alerts for unusual activity
3. Review user audit logs regularly
4. Enable Supabase 2FA for admin accounts

---

## Support

If credentials were exposed:
- Supabase: Contact support@supabase.com
- Firebase: Check for unauthorized projects/users
- Consider security audit if customer data was accessible
