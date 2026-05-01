# Setup Supabase MCP Access

## The Problem
The token you provided is being rejected. You need a **Supabase Access Token** (for API access), not the **Anon Key** or **Service Role Key** (for database access).

## Get the Correct Token

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard/account/tokens
2. Sign in to your Supabase account
3. Click "New Access Token"
4. Give it a name (e.g., "MCP")
5. **Copy the token** (it starts with `sbp_` and is ~40+ characters)
6. Use this token for MCP

### Option 2: Via Supabase CLI
```bash
# Login to Supabase CLI
supabase login

# This will open a browser and authenticate you
# After login, the token is stored automatically

# You can also get your token from:
cat ~/.config/supabase/config.toml | grep access_token
```

## What You Might Have Provided
- ❌ Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT format)
- ❌ Service Role Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT format)
- ✅ Access Token: `sbp_dad2f46f9af98e124a838dfad3258d86d03f2c8e...` (starts with sbp_)

## Configure MCP Server

The MCP server needs the token configured. Check your `.mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=vrhptrtgrpftycvojaqo",
      "headers": {
        "Authorization": "Bearer sbp_YOUR_ACCESS_TOKEN_HERE"
      }
    }
  }
}
```

Or set environment variable:
```bash
export SUPABASE_ACCESS_TOKEN="sbp_YOUR_ACCESS_TOKEN_HERE"
```

## Alternative: Manual SQL Execution

Since MCP isn't working, you can run SQL manually:

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/vrhptrtgrpftycvojao
2. Navigate to "SQL Editor" → "New Query"
3. Paste the contents of `scripts/create-test-agent-complete.sql`
4. Click "Run"

## Your Project Details
- **Project ID**: `vrhptrtgrpftycvojaqo`
- **Project URL**: https://supabase.com/dashboard/project/vrhptrtgrpftycvojaqo

---

**Please provide your actual Supabase Access Token from the Account Tokens page, not the project API keys.**
