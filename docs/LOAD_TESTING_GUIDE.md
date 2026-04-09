# Load Testing Guide

## Overview
This document outlines the load testing strategy for Aqua Prime (Make Happy App).

## Testing Scope

### Target Metrics
- **Concurrent Users**: 100+ simultaneous users
- **API Response Time**: <500ms for 95th percentile
- **Error Rate**: <1% under load

### Critical Endpoints to Test

1. **Authentication**
   - Phone OTP login
   - Google OAuth
   - Session refresh

2. **Sales Operations**
   - Create sale
   - List sales
   - Sales analytics

3. **Transactions**
   - Record payment
   - Transaction history

4. **Edge Functions**
   - `firebase-phone-exchange` (phone auth)
   - `verify-otp-opensms` (OTP verification)
   - `daily-handover-snapshot` (daily aggregation)

## Testing Tools

### Recommended Tools
1. **k6** (Grafana k6) - Primary load testing
2. **Apache JMeter** - Alternative
3. **Supabase built-in** - For database load

### k6 Example Script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'https://vrhptrtgrpftycvojaqo.supabase.co';

export default function () {
  // Test edge function
  const res = http.post(
    `${BASE_URL}/functions/v1/firebase-phone-exchange`,
    JSON.stringify({ idToken: 'test' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': __ENV.VITE_SUPABASE_ANON_KEY,
      },
    }
  );
  
  check(res, { 'status was 200': (r) => r.status === 200 });
  sleep(1);
}
```

## Running Tests

### Quick Test (local)
```bash
# Install k6
brew install k6  # macOS
# or
sudo apt-get install k6  # Ubuntu

# Run test
k6 run scripts/load-test.js
```

### CI Integration
Add to `.github/workflows/load-test.yml`:
```yaml
name: Load Test
on:
  schedule:
    - cron: '0 2 * * *'  # Weekly
jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run k6
        uses: grafana/k6-action@v0.2.0
        with:
          filename: scripts/load-test.js
          env: |
            VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

## Test Scenarios

### Scenario 1: Auth Storm
Simulate 100 users attempting login simultaneously.

### Scenario 2: Sales Rush
Simulate 50 agents recording sales during peak hours.

### Scenario 3: End of Day
Simulate handover snapshot generation with 100 staff.

## Monitoring
- Use Supabase dashboard for DB metrics
- Use Sentry for frontend error tracking
- Check Vercel/hosting analytics for API metrics

## Success Criteria
- [ ] 100 concurrent users supported
- [ ] <500ms p95 response time
- [ ] <1% error rate
- [ ] No database connection issues
- [ ] No timeout errors