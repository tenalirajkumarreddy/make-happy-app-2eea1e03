# UAT Test Plan - Aqua Prime (Make Happy App)

**Date:** 2026-04-07  
**Version:** 1.0  
**Status:** Ready for Testing

---

## Executive Summary

This UAT Plan covers all critical features verified during the pre-production audit. The application has passed:
- 0 lint errors, 104 unit tests
- All RLS security policies verified
- Performance optimizations applied
- Edge functions deployed and tested

---

## Test Environment

| Component | Details |
|-----------|---------|
| **Frontend** | https://aquaprimesales.vercel.app |
| **Backend** | Supabase (Project: vrhptrtgrpftycvojaqo) |
| **Mobile** | Capacitor APK (build:debug) |
| **Test Users** | Create 2-3 users per role |

---

## Test Scenarios by Role

### 🧪 Role: Super Admin

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 1.1 | Login with email/password | Successfully logged in | Critical |
| 1.2 | View dashboard | All metrics displayed | Critical |
| 1.3 | Create new staff user | Staff invitation sent | Critical |
| 1.4 | View all staff | List of all staff displayed | High |
| 1.5 | View all customers | List of customers displayed | High |
| 1.6 | Access reports | Reports load correctly | High |
| 1.7 | Manage company settings | Settings can be updated | Medium |
| 1.8 | View handover snapshots | Daily snapshots visible | High |

### 🧪 Role: Manager

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 2.1 | Login | Successfully logged in | Critical |
| 2.2 | View team performance | Team metrics displayed | Critical |
| 2.3 | Approve/reject handovers | Status updates correctly | Critical |
| 2.4 | Create sales | Sale recorded successfully | Critical |
| 2.5 | View agent routes | Map displays routes | High |
| 2.6 | Manage store assignments | Assignments work | High |

### 🧪 Role: Agent (Field Staff)

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 3.1 | Login with phone OTP | OTP sent and verified | Critical |
| 3.2 | Record new sale | Sale created with products | Critical |
| 3.3 | Record payment collection | Transaction created | Critical |
| 3.4 | View assigned stores | Store list displayed | Critical |
| 3.5 | GPS location captured | Location saved with sale | High |
| 3.6 | Create handover | Handover created | High |
| 3.7 | Upload store photo | Photo uploaded to bucket | High |
| 3.8 | Offline mode | Works without internet | High |

### 🧪 Role: Marketer

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 4.1 | Login | Successfully logged in | Critical |
| 4.2 | Add new customer | Customer created | Critical |
| 4.3 | Create customer order | Order submitted | High |
| 4.4 | View customer orders | Order history displayed | High |
| 4.5 | Update customer profile | Changes saved | Medium |

### 🧪 Role: POS (Retail Staff)

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 5.1 | Login | Successfully logged in | Critical |
| 5.2 | Record sale | Sale with items recorded | Critical |
| 5.3 | Process payment | Payment recorded | Critical |
| 5.4 | View inventory | Stock levels displayed | High |
| 5.5 | Update stock | Inventory adjusted | High |

### 🧪 Role: Customer

| # | Test Case | Expected Result | Priority |
|---|-----------|-----------------|----------|
| 6.1 | Self-registration | Account created | Critical |
| 6.2 | Login with phone | OTP authentication works | Critical |
| 6.3 | View own orders | Order history shown | Critical |
| 6.4 | View balance | Outstanding balance displayed | Critical |
| 6.5 | Make payment | Payment processed | High |
| 6.6 | Link Google account | OAuth linking works | Medium |

---

## Cross-Feature Tests

| # | Feature | Test Scenario | Expected |
|---|---------|---------------|----------|
| 7.1 | **Authentication** | Login via phone OTP | Works |
| 7.2 | **Authentication** | Login via Google | Works |
| 7.3 | **Security** | Access another user's data | Blocked by RLS |
| 7.4 | **Performance** | Load sales list (100+ records) | <2 seconds |
| 7.5 | **Offline** | Record sale offline, sync online | Queued & synced |
| 7.6 | **Notifications** | Receive sale notification | Toast appears |
| 7.7 | **File Upload** | Upload KYC document | Saved to bucket |
| 7.8 | **Maps** | View store locations | Map loads |

---

## Security Test Cases

| # | Test | Expected |
|---|------|-----------|
| 8.1 | Agent tries to view another agent's sales | Blocked (RLS) |
| 8.2 | Customer tries to access admin panel | Blocked (Role guard) |
| 8.3 | Unauthenticated user accesses API | Blocked (JWT required) |
| 8.4 | Upload file without auth | Blocked (Storage RLS) |

---

## Bug Reporting Template

```
**Bug Report #**
- **Environment:** [Web/Mobile]
- **Role:** [Role name]
- **Test Case:** [From table above]
- **Steps to Reproduce:**
  1. 
  2. 
  3. 
- **Expected Result:** 
- **Actual Result:**
- **Severity:** [Critical/High/Medium/Low]
- **Screenshots:** [Attach]
```

---

## Sign-Off Sheet

| Feature Area | Tester Name | Date | Signature | Pass/Fail |
|--------------|-------------|------|-----------|-----------|
| Super Admin | | | | |
| Manager | | | | |
| Agent | | | | |
| Marketer | | | | |
| POS | | | | |
| Customer | | | | |
| Cross-Feature | | | | |
| Security | | | | |

---

## Final Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Technical Lead | | | |
| QA Lead | | | |

---

**Test Complete When:**
- [ ] All Critical priority test cases pass
- [ ] All High priority test cases pass  
- [ ] No Critical/High bugs open
- [ ] Sign-off sheet completed
- [ ] Final approval obtained