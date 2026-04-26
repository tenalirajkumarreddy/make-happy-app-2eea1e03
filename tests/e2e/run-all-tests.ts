/**
 * Master Test Execution Script
 * Runs comprehensive E2E tests for the Aqua Prime application
 * 
 * Usage: npx ts-node tests/e2e/run-all-tests.ts
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { MultiAgentTestFramework } from './multi-agent-test-framework';
import { CROSS_ROLE_SCENARIOS } from './multi-agent-test-framework';
import { SystematicTestRunner } from './systematic-test-runner';
import { PAGE_CATALOG, generateCoverageReport } from './page-action-catalog';
import { TEST_ACCOUNTS } from './test-config';
import * as fs from 'fs';
import * as path from 'path';

interface TestSummary {
  timestamp: string;
  duration: number;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  results: any[];
}

async function ensureDirectories() {
  const dirs = [
    'tests/e2e/screenshots',
    'tests/e2e/screenshots/multiagent',
    'tests/e2e/reports',
    'tests/e2e/test-results',
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

async function runCrossRoleTests(): Promise<TestSummary> {
  console.log('\n========================================');
  console.log('CROSS-ROLE DATA SYNCHRONIZATION TESTS');
  console.log('========================================\n');

  const framework = new MultiAgentTestFramework();
  const startTime = Date.now();
  const results: any[] = [];

  try {
    await framework.initialize();

    for (const scenario of CROSS_ROLE_SCENARIOS) {
      console.log(`\nRunning: ${scenario.name}`);
      console.log(`Description: ${scenario.description}`);

      const result = await framework.runScenario(scenario);
      results.push(result);

      console.log(`Result: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`Duration: ${result.duration}ms`);

      if (result.errors.length > 0) {
        console.log('Errors:', result.errors);
      }
    }

  } finally {
    await framework.cleanup();
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return {
    timestamp: new Date().toISOString(),
    duration,
    totalTests: results.length,
    passed,
    failed,
    skipped: 0,
    results,
  };
}

async function runPermissionTests(): Promise<TestSummary> {
  console.log('\n========================================');
  console.log('PERMISSION BOUNDARY TESTS');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const runner = new SystematicTestRunner(page);

  const startTime = Date.now();
  const results: any[] = [];

  try {
    // Test each page for each role
    for (const pageDef of PAGE_CATALOG) {
      console.log(`\nTesting page: ${pageDef.path}`);

      for (const role of Object.keys(TEST_ACCOUNTS)) {
        // Login
        const loggedIn = await runner.loginAs(role as keyof typeof TEST_ACCOUNTS);
        if (!loggedIn) {
          console.error(`Failed to login ${role}`);
          continue;
        }

        // Test page
        const result = await runner.testPageForRole(pageDef, role);
        results.push(result);

        // Logout
        await page.goto('http://localhost:5003/auth');
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    await browser.close();
  }

  const duration = Date.now() - startTime;
  const passed = results.filter(r => r.actions.every(a => a.status === 'passed')).length;
  const failed = results.filter(r => r.actions.some(a => a.status === 'failed')).length;

  return {
    timestamp: new Date().toISOString(),
    duration,
    totalTests: results.length,
    passed,
    failed,
    skipped: 0,
    results,
  };
}

async function generateReports(
  crossRoleSummary: TestSummary,
  permissionSummary: TestSummary
) {
  console.log('\n========================================');
  console.log('GENERATING REPORTS');
  console.log('========================================\n');

  // Generate coverage report
  const coverageReport = generateCoverageReport();
  fs.writeFileSync('tests/e2e/reports/page-coverage-report.md', coverageReport);
  console.log('✅ Page coverage report saved');

  // Generate test summary
  const summary = {
    timestamp: new Date().toISOString(),
    crossRole: crossRoleSummary,
    permission: permissionSummary,
    totalTests: crossRoleSummary.totalTests + permissionSummary.totalTests,
    totalPassed: crossRoleSummary.passed + permissionSummary.passed,
    totalFailed: crossRoleSummary.failed + permissionSummary.failed,
  };

  fs.writeFileSync(
    'tests/e2e/reports/test-summary.json',
    JSON.stringify(summary, null, 2)
  );

  // Generate markdown report
  const report = `
# E2E Test Report

**Generated:** ${new Date().toLocaleString()}

## Summary

| Category | Total | Passed | Failed | Skipped |
|----------|-------|--------|--------|---------|
| Cross-Role Tests | ${crossRoleSummary.totalTests} | ${crossRoleSummary.passed} | ${crossRoleSummary.failed} | ${crossRoleSummary.skipped} |
| Permission Tests | ${permissionSummary.totalTests} | ${permissionSummary.passed} | ${permissionSummary.failed} | ${permissionSummary.skipped} |
| **Total** | **${summary.totalTests}** | **${summary.totalPassed}** | **${summary.totalFailed}** | **0** |

## Cross-Role Data Synchronization Tests

Duration: ${crossRoleSummary.duration}ms

${crossRoleSummary.results.map(r => `
### ${r.scenario}
- Status: ${r.success ? '✅ PASSED' : '❌ FAILED'}
- Duration: ${r.duration}ms
- Agents: ${r.agentResults.size}
${r.errors.length > 0 ? `- Errors: ${r.errors.join(', ')}` : ''}
`).join('\n')}

## Permission Boundary Tests

Duration: ${permissionSummary.duration}ms

## Test Accounts

| Role | Phone | OTP |
|------|-------|-----|
${Object.entries(TEST_ACCOUNTS).map(([role, account]) =>
  `| ${role} | ${account.phone} | 000000 |`
).join('\n')}

## Next Steps

1. Review failed tests
2. Check screenshots in tests/e2e/screenshots/
3. Fix any issues found
4. Re-run tests to verify fixes

---
Report generated by Aqua Prime E2E Test Suite
`;

  fs.writeFileSync('tests/e2e/reports/e2e-test-report.md', report);
  console.log('✅ E2E test report saved');

  return summary;
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     AQUA PRIME - COMPREHENSIVE E2E TEST SUITE            ║');
  console.log('║     Cross-Role • Data Flow • Permission Boundaries        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Ensure directories exist
  await ensureDirectories();

  const startTime = Date.now();

  try {
    // Run Cross-Role Tests
    console.log('Starting Cross-Role Tests...');
    const crossRoleSummary = await runCrossRoleTests();

    // Run Permission Tests
    console.log('\nStarting Permission Tests...');
    const permissionSummary = await runPermissionTests();

    // Generate Reports
    const finalSummary = await generateReports(crossRoleSummary, permissionSummary);

    // Final Summary
    const totalDuration = Date.now() - startTime;
    console.log('\n========================================');
    console.log('TEST EXECUTION COMPLETE');
    console.log('========================================');
    console.log(`Total Tests: ${finalSummary.totalTests}`);
    console.log(`Passed: ${finalSummary.totalPassed} ✅`);
    console.log(`Failed: ${finalSummary.totalFailed} ❌`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log('\nReports saved to:');
    console.log('  - tests/e2e/reports/e2e-test-report.md');
    console.log('  - tests/e2e/reports/page-coverage-report.md');
    console.log('  - tests/e2e/reports/test-summary.json');
    console.log('\nScreenshots saved to:');
    console.log('  - tests/e2e/screenshots/');
    console.log('========================================\n');

    // Exit with appropriate code
    process.exit(finalSummary.totalFailed > 0 ? 1 : 0);

  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runCrossRoleTests, runPermissionTests, generateReports };
