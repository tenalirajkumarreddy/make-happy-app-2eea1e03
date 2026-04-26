# Aqua Prime E2E Testing Framework

## 🎯 Overview

This comprehensive E2E testing framework tests:
- ✅ **Cross-role simultaneous user interactions**
- ✅ **Real-time data synchronization between roles**
- ✅ **Permission boundaries and role isolation**
- ✅ **Complete business workflows** spanning multiple roles
- ✅ **Data integrity and consistency** across users
- ✅ **Systematic coverage** of all pages and actions

## 📁 Test Files Structure

```
tests/e2e/
├── ai-test-agent.ts                    # Single-agent intelligent testing
├── multi-agent-test-framework.ts       # Multi-role simultaneous testing ⭐
├── systematic-test-runner.ts            # Systematic page coverage
├── page-action-catalog.ts               # All actions on all pages ⭐
├── test-config.ts                       # Test accounts & configuration
├── test-catalog.md                      # Comprehensive test documentation ⭐
├── run-all-tests.ts                    # Master test execution script
├── role-tests/
│   ├── operator.spec.ts               # Operator-specific tests
│   ├── cross-role-sync.spec.ts        # Cross-role data sync tests ⭐
│   └── systematic-page-coverage.spec.ts # Page-by-page coverage ⭐
├── screenshots/                         # Test screenshots (auto-created)
└── reports/                             # Test reports (auto-created)
```

## 🎭 Test Accounts

All accounts use universal OTP: `000000`

| Role | Phone | Description |
|------|-------|-------------|
| **super_admin** | +917997222262 | Full system access |
| **manager** | +916305295757 | Warehouse-scoped admin |
| **agent** | +919494910007 | Field sales with routes |
| **marketer** | +919879879870 | Sales with order creation |
| **operator** | +918888888888 | POS + Inventory + Attendance |
| **customer** | +919090909090 | Self-service portal |

## 🚀 How to Run Tests

### 1. Quick Test (Single Role)
```bash
# Test operator role
npx playwright test tests/e2e/role-tests/operator.spec.ts --project=chromium

# Test with headless mode
npx playwright test tests/e2e/operator.spec.ts --project=chromium --headed
```

### 2. Cross-Role Sync Tests
```bash
# Multi-agent simultaneous testing
npx playwright test tests/e2e/role-tests/cross-role-sync.spec.ts --project=chromium
```

### 3. Systematic Page Coverage
```bash
# Test every action on every page
npx playwright test tests/e2e/role-tests/systematic-page-coverage.spec.ts --project=chromium
```

### 4. Full Test Suite
```bash
# Run everything
npx ts-node tests/e2e/run-all-tests.ts

# Or with Playwright
npx playwright test tests/e2e/ --project=chromium --reporter=html
```

## 📋 Test Scenarios Covered

### Cross-Role Data Flow Tests
1. **TC-CRS-01**: Agent creates sale → Manager sees real-time update
2. **TC-CRS-02**: Marketer creates order → Agent converts to sale
3. **TC-CRS-03**: Manager transfers stock → Operator sees updated inventory
4. **TC-CRS-04**: Permission boundaries enforced
5. **TC-CRS-05**: Multi-role simultaneous login stress test

### Permission Boundary Tests
- Operator blocked from `/orders`, `/transactions`
- Agent route isolation (only assigned customers)
- Manager warehouse isolation
- super_admin full access

### Workflow Integration Tests
1. Sale creation to collection workflow
2. Order creation to delivery workflow
3. Stock transfer across warehouses
4. Production to sale workflow
5. Staff onboarding workflow

### Data Integrity Tests
- Outstanding balance consistency
- Inventory balance validation
- Cash reconciliation
- Transaction consistency

## 📄 Page Coverage

| Page | Path | Allowed Roles |
|------|------|---------------|
| **Sales** | /sales | super_admin, manager, agent, operator |
| **Inventory** | /inventory | super_admin, manager, operator |
| **Orders** | /orders | super_admin, manager, agent, marketer |
| **Attendance** | /attendance | super_admin, manager, operator |
| **HR Staff** | /hr/staff | super_admin, manager, operator |
| **Customers** | /customers | super_admin, manager, agent |

## 🔧 Key Features

### Multi-Agent Framework
- Simultaneous login of multiple roles
- Real-time synchronization testing
- Cross-role data validation
- Parallel action execution

### Page Action Catalog
- 50+ defined actions across all pages
- Role-specific action validation
- Database table tracking
- Realtime event mapping

### Smart Test Runner
- Automatic login/logout handling
- Screenshot capture on failure
- Detailed error reporting
- Performance metrics

## 📊 Test Reports

Reports are automatically generated in `tests/e2e/reports/`:

1. **e2e-test-report.md** - Complete test summary
2. **page-coverage-report.md** - Action-by-action coverage
3. **test-summary.json** - Machine-readable results

## 🐛 Debugging

### View Screenshots
```bash
# Failed test screenshots
ls tests/e2e/screenshots/

# Multi-agent test screenshots
ls tests/e2e/screenshots/multiagent/
```

### Check Test Output
```bash
# With verbose output
npx playwright test --reporter=line --verbose

# With HTML report
npx playwright test --reporter=html
# Then: npx playwright show-report
```

### Individual Test Debugging
```typescript
// Add to any test
test('Debug Test', async ({ page }) => {
  await page.pause(); // Pauses for Playwright Inspector
});
```

## 🔄 Continuous Integration

Add to your CI/CD pipeline:

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npx playwright install
      - name: Run E2E tests
        run: npx playwright test tests/e2e/ --project=chromium
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: tests/e2e/reports/
```

## 📚 Documentation

- **test-catalog.md** - Complete test scenarios documentation
- **Page Action Catalog** - All actions in `page-action-catalog.ts`
- **Test Config** - Account settings in `test-config.ts`

## 🎯 Testing Philosophy

This framework tests:
1. **Inter-role interactions** - How roles affect each other
2. **Intra-role consistency** - Same role on different devices
3. **Data flow** - Changes propagate correctly
4. **Permission boundaries** - Access control works
5. **Real-time sync** - Live updates happen correctly

## 💡 Tips

1. **Use headless mode** for CI: `--headless`
2. **Use headed mode** for debugging: `--headed`
3. **Focus on specific tests**: `-g "test name"`
4. **Run specific file**: `tests/e2e/role-tests/operator.spec.ts`
5. **Parallel execution**: Tests run in parallel by default

## 🔒 Security Notes

- Test OTP `000000` is for development only
- Edge functions detect test mode and log `[TEST MODE]`
- No real SMS sent for test phones
- Test data is isolated from production

## 🆘 Support

If tests fail:
1. Check dev server is running on port 5003
2. Verify test accounts exist in database
3. Check edge functions are deployed
4. Review screenshots in `tests/e2e/screenshots/`
5. Check `test-results/` for detailed logs

---

**Happy Testing! 🚀**
