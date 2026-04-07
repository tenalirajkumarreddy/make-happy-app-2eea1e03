# Incident Response Playbook

## Overview

This playbook provides step-by-step procedures for responding to production incidents in the Aqua Prime (Make Happy App) application.

**Purpose**: Minimize downtime, protect data, maintain customer trust  
**Audience**: DevOps, engineering leads, on-call engineers  
**Last Updated**: 2026-04-07

---

## Severity Levels

### P0 - Critical (Response Time: <15 minutes)
- Complete application outage
- Data breach or suspected unauthorized access
- Payment processing failure
- Database corruption

### P1 - High (Response Time: <1 hour)
- Partial application outage (affects >25% of users)
- Authentication/login failures
- Critical feature broken (sales recording, payments)
- Performance degradation (>5s response times)

### P2 - Medium (Response Time: <4 hours)
- Non-critical feature broken
- Minor performance issues
- Edge function errors (with fallback working)

### P3 - Low (Response Time: <24 hours)
- UI bugs
- Cosmetic issues
- Documentation errors

---

## Incident Response Team

### Roles:

- **Incident Commander (IC)**: Coordinates response, makes decisions
- **Technical Lead**: Investigates root cause, implements fixes
- **Communications Lead**: Updates stakeholders, users
- **Support Lead**: Handles customer inquiries

### On-Call Rotation:
- Primary: Technical Lead (24/7)
- Secondary: DevOps Engineer
- Escalation: CTO/Engineering Manager

---

## Response Procedures

### 1. Detection & Alert

**Sources:**
- Automated monitoring alerts (Sentry, uptime monitors)
- Customer reports
- Internal team discovery
- Edge function error logs

**First Actions:**
1. Acknowledge the alert within 5 minutes
2. Assess severity level
3. Create incident ticket/channel
4. Notify Incident Commander

---

### 2. P0 - Critical Incident Response

#### Application Outage

**Symptoms:**
- HTTP 500/502/503 errors
- Application not loading
- Database connection failures

**Immediate Actions:**

```bash
# 1. Check application status
curl -I https://aquaprimesales.vercel.app

# 2. Check Supabase project status
# Go to: https://status.supabase.com
# Or check project health in dashboard

# 3. Check edge function logs
# Dashboard → Edge Functions → View logs

# 4. Check database connections
# Dashboard → Database → Connection pooler
```

**Mitigation Steps:**

1. **If Vercel deployment issue:**
   ```bash
   # Rollback to previous deployment
   vercel rollback
   ```

2. **If Supabase database issue:**
   - Check database CPU/memory in dashboard
   - If overloaded: Pause non-critical edge functions
   - Contact Supabase support if infrastructure issue

3. **If edge function failure:**
   - Disable failing edge function
   - Enable fallback/degraded mode if available
   - Fix and redeploy

**Communication Template:**

```
INCIDENT ALERT - P0

Status: [INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED]
Impact: Application unavailable for all users
Started: [timestamp]
ETA: [estimated resolution time]

Updates:
- [timestamp]: Issue detected, team mobilized
- [timestamp]: Root cause identified: [description]
- [timestamp]: Fix deployed, monitoring
- [timestamp]: Service restored

Next Update: [time]
```

#### Data Breach / Unauthorized Access

**Symptoms:**
- Suspicious database queries in logs
- Unusual authentication patterns
- Reports of unauthorized data access
- Security alert from monitoring tools

**IMMEDIATE ACTIONS (DO NOT DELAY):**

1. **Isolate the threat:**
   ```sql
   -- Immediately revoke suspicious user sessions
   DELETE FROM auth.sessions WHERE user_id = '[suspicious-user-id]';
   
   -- Ban the user account
   -- Use edge function: toggle-user-ban
   ```

2. **Preserve evidence:**
   - Export edge function logs
   - Export database audit logs
   - Take database snapshot
   - Screenshot any suspicious activity

3. **Assess scope:**
   ```sql
   -- Check what data was accessed
   SELECT * FROM audit_logs 
   WHERE user_id = '[suspicious-user-id]'
   ORDER BY created_at DESC;
   
   -- Check RLS policy bypasses
   SELECT * FROM pg_policies WHERE polname LIKE '%[table]%';
   ```

4. **Notify stakeholders:**
   - Incident Commander
   - CTO/CEO
   - Legal team (if customer data accessed)
   - Security team

5. **Stop the breach:**
   - Fix vulnerable RLS policy immediately
   - Deploy emergency patch
   - Force password reset for affected users

**Post-Incident:**
- File security incident report
- Notify affected customers (if required by GDPR/privacy laws)
- Review and update RLS policies
- Conduct security audit

---

### 3. P1 - High Priority Incident Response

#### Authentication Failures

**Symptoms:**
- Users cannot sign in with OTP
- Google OAuth redirects failing
- "Invalid token" errors

**Investigation:**

```bash
# Check firebase-phone-exchange logs
# Dashboard → Edge Functions → firebase-phone-exchange → View Logs

# Check google-staff-exchange logs
# Dashboard → Edge Functions → google-staff-exchange → View Logs

# Test authentication manually
curl -X POST https://[project-ref].supabase.co/functions/v1/firebase-phone-exchange \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [anon-key]" \
  -d '{"idToken": "[test-token]"}'
```

**Common Fixes:**

1. **OTP not working:**
   - Check Firebase project configuration
   - Verify phone number is in correct format
   - Check RPC functions are working: `find_customer_by_phone()`

2. **Google OAuth failing:**
   - Verify redirect URIs in Google Cloud Console
   - Check Supabase Auth provider settings
   - Verify staff_directory has email for user

#### Sales Recording Failures

**Symptoms:**
- Sales not saving
- "Failed to create sale" errors
- Database constraint violations

**Investigation:**

```sql
-- Check recent sales
SELECT * FROM sales 
ORDER BY created_at DESC 
LIMIT 10;

-- Check for constraint violations in logs
-- Look for: "violates foreign key constraint" or "violates check constraint"

-- Test record_sale RPC
SELECT record_sale(
  p_customer_id := '[customer-id]',
  p_store_id := '[store-id]',
  p_amount := 1000,
  p_created_by := '[user-id]',
  p_items := '[{"product_id": "...", "quantity": 1}]'::jsonb
);
```

**Common Fixes:**

1. **RPC function error:**
   - Review `record_sale` function logic
   - Check if recent migration broke it
   - Test with known-good parameters

2. **Permission error:**
   - Verify RLS policies on sales table
   - Check user_roles for the user
   - Verify staff_directory has active = true

3. **Data validation error:**
   - Check product inventory
   - Verify store exists and is active
   - Validate customer exists

---

### 4. P2/P3 - Medium/Low Priority Response

**Process:**
1. Create GitHub issue with full error details
2. Assign to appropriate team member
3. Schedule fix in next sprint/hotfix
4. Test thoroughly before deploying
5. Monitor after deployment

---

## Common Issues & Quick Fixes

### Issue: Slow API Responses

**Diagnosis:**
```sql
-- Find slow queries
SELECT 
  query,
  mean_exec_time,
  calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check database indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';
```

**Fix:**
- Add missing indexes
- Optimize N+1 query patterns
- Enable query result caching
- Scale database if needed

### Issue: Edge Function Timeouts

**Diagnosis:**
```bash
# Check edge function logs for timeout patterns
# Dashboard → Edge Functions → [function-name] → Logs
# Look for: "Function timeout" or "504 Gateway Timeout"
```

**Fix:**
- Optimize database queries (use RPC aggregations)
- Reduce payload sizes
- Add pagination for large datasets
- Increase timeout limit (max 60s for Edge Functions)

### Issue: Storage Bucket Access Denied

**Diagnosis:**
```sql
-- Check storage policies
SELECT * FROM storage.policies 
WHERE bucket_id = 'kyc-documents';

-- Verify user has correct role
SELECT r.role 
FROM user_roles r 
WHERE r.user_id = auth.uid();
```

**Fix:**
- Update storage RLS policies
- Verify user authentication token
- Check folder path structure

---

## Rollback Procedures

### Frontend Rollback (Vercel)

```bash
# List recent deployments
vercel list

# Rollback to previous deployment
vercel rollback

# Or rollback to specific deployment
vercel rollback [deployment-url]
```

### Database Rollback

**⚠️ WARNING: Only use in emergency, data loss possible**

```sql
-- Rollback last migration (if causing issues)
-- First, identify the migration version
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 1;

-- Then manually reverse the changes or restore from backup
-- Contact Supabase support for point-in-time recovery
```

### Edge Function Rollback

```bash
# Revert to previous version
# Dashboard → Edge Functions → [function-name] → Deployments → Redeploy previous version

# Or disable the function temporarily
# Dashboard → Edge Functions → [function-name] → Disable
```

---

## Monitoring & Alerting

### Key Metrics to Monitor:

1. **Application Uptime**
   - Target: 99.9% uptime
   - Alert if down for >2 minutes

2. **API Response Time**
   - Target: <500ms p95
   - Alert if >2s p95

3. **Error Rate**
   - Target: <0.1% of requests
   - Alert if >1% error rate

4. **Database Performance**
   - Target: <100ms average query time
   - Alert if >500ms or high CPU usage

5. **Edge Function Success Rate**
   - Target: >99% success rate
   - Alert if <95% success rate

### Alert Channels:

- **Email**: On-call engineer email
- **SMS**: Critical (P0) alerts only
- **Slack**: #incidents channel for all alerts
- **PagerDuty**: Escalation after 15 minutes

---

## Post-Incident Review

### Conduct Within 48 Hours:

1. **Timeline reconstruction**: When did it start? How was it detected?
2. **Root cause analysis**: Why did it happen?
3. **Impact assessment**: How many users affected? Revenue lost?
4. **Response evaluation**: What went well? What can improve?
5. **Action items**: Preventive measures, monitoring improvements

### Template:

```markdown
# Post-Incident Review: [Incident Title]

**Date**: [date]
**Duration**: [start time] - [end time]
**Severity**: P[0-3]
**Incident Commander**: [name]

## Summary
[Brief description of what happened]

## Impact
- Users affected: [number]
- Duration: [time]
- Revenue impact: [if applicable]

## Timeline
- [HH:MM] - Issue detected
- [HH:MM] - Investigation started
- [HH:MM] - Root cause identified
- [HH:MM] - Fix deployed
- [HH:MM] - Incident resolved

## Root Cause
[Detailed explanation]

## Resolution
[What was done to fix it]

## Action Items
- [ ] [Action 1] - Owner: [name] - Due: [date]
- [ ] [Action 2] - Owner: [name] - Due: [date]

## Lessons Learned
[What we learned and will do differently]
```

---

## Emergency Contacts

### Internal Team:
- **On-Call Engineer**: [phone/email]
- **Incident Commander**: [phone/email]
- **CTO**: [phone/email]

### External Services:
- **Supabase Support**: support@supabase.io (Enterprise SLA)
- **Vercel Support**: https://vercel.com/support
- **Firebase Support**: https://firebase.google.com/support

### Escalation Path:
1. On-call engineer (0-15 min)
2. Technical lead (15-30 min)
3. Engineering manager (30-60 min)
4. CTO (60+ min or P0)

---

## Related Documentation

- `docs/AUDIT_PROGRESS.md` - Security audit status
- `docs/RLS_SECURITY_AUDIT.md` - RLS policy reference
- `docs/N+1_QUERY_OPTIMIZATIONS.md` - Performance optimization guide
- `docs/GOOGLE_OAUTH_SETUP.md` - OAuth configuration
- `docs/HORIZONTAL_ACCESS_TESTING.md` - Security testing procedures

---

**Status**: Playbook created, team training pending  
**Next Review**: 2026-05-07 (quarterly review)  
**Owner**: DevOps Team
