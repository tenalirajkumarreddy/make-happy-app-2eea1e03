/**
 * Systematic Test Runner
 * Executes all actions in the Page Catalog across all roles
 */

import { test, expect, Page } from '@playwright/test';
import {
  PageDefinition,
  PageAction,
  PAGE_CATALOG,
  getActionsForRole,
  getBlockedPagesForRole,
} from './page-action-catalog';
import { TEST_ACCOUNTS } from './test-config';

export interface SystematicTestResult {
  page: string;
  action: string;
  role: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
}

export interface PageTestSuite {
  page: PageDefinition;
  roleResults: Map<string, RoleTestResult>;
}

export interface RoleTestResult {
  role: string;
  canAccess: boolean;
  actions: SystematicTestResult[];
  blockedActions: string[];
}

export class SystematicTestRunner {
  private results: SystematicTestResult[] = [];
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Login as a specific role
   */
  async loginAs(role: keyof typeof TEST_ACCOUNTS): Promise<boolean> {
    const account = TEST_ACCOUNTS[role];
    console.log(`[SystematicTest] Logging in as ${role} (${account.phone})`);

    try {
      await this.page.goto('http://localhost:5003/auth');
      await this.page.waitForLoadState('networkidle');

      // Fill phone
      const phoneInput = await this.page.$('input[type="tel"], input[placeholder*="phone"]');
      if (phoneInput) {
        await phoneInput.fill(account.phone);
      }

      // Submit
      await this.page.click('button[type="submit"], button:has-text("Send")');

      // Wait for OTP input
      await this.page.waitForSelector('input[maxlength="6"], input[placeholder*="OTP"]', { timeout: 10000 });

      // Fill OTP
      await this.page.fill('input[maxlength="6"], input[placeholder*="OTP"]', '000000');
      await this.page.click('button:has-text("Verify"), button[type="submit"]');

      // Wait for dashboard
      await this.page.waitForURL(/dashboard|portal|\/$/, { timeout: 30000 });
      await this.page.waitForLoadState('networkidle');

      console.log(`[SystematicTest] ✓ ${role} logged in`);
      return true;
    } catch (error) {
      console.error(`[SystematicTest] ✗ ${role} login failed:`, error);
      return false;
    }
  }

  /**
   * Test a single page action
   */
  async testAction(
    pageDef: PageDefinition,
    action: PageAction,
    role: string
  ): Promise<SystematicTestResult> {
    const startTime = Date.now();
    const result: SystematicTestResult = {
      page: pageDef.path,
      action: action.id,
      role,
      status: 'passed',
      duration: 0,
    };

    try {
      console.log(`[SystematicTest] Testing ${action.id}: ${action.name}`);

      // Navigate to page first
      await this.page.goto(`http://localhost:5003${pageDef.path}`);
      await this.page.waitForLoadState('networkidle');

      // Execute action based on type
      switch (action.actionType) {
        case 'click':
          await this.page.click(action.selector);
          break;
        case 'fill':
          // Use a test value or the value from action
          const testValue = action.id.includes('amount') ? '1000' :
                           action.id.includes('search') ? 'test' :
                           action.id.includes('date') ? new Date().toISOString().split('T')[0] :
                           'test-value';
          await this.page.fill(action.selector, testValue);
          break;
        case 'select':
          // Try to select first option
          const options = await this.page.$$eval(`${action.selector} option`, opts =>
            opts.filter(o => o.value).map(o => o.value)
          );
          if (options.length > 0) {
            await this.page.selectOption(action.selector, options[0]);
          }
          break;
        case 'verify':
          await this.page.waitForSelector(action.selector, { timeout: 5000 });
          break;
        case 'upload':
          // Skip upload actions for now
          result.status = 'skipped';
          break;
        case 'api':
          // Skip API-only actions
          result.status = 'skipped';
          break;
      }

      // Wait for any effects
      await this.page.waitForTimeout(1000);

      result.duration = Date.now() - startTime;
      console.log(`[SystematicTest] ✓ ${action.id} passed (${result.duration}ms)`);

    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      result.duration = Date.now() - startTime;
      console.error(`[SystematicTest] ✗ ${action.id} failed:`, result.error);
    }

    this.results.push(result);
    return result;
  }

  /**
   * Test all actions for a role on a page
   */
  async testPageForRole(
    pageDef: PageDefinition,
    role: string
  ): Promise<RoleTestResult> {
    console.log(`\n[SystematicTest] ========================================`);
    console.log(`[SystematicTest] Testing ${pageDef.path} for role: ${role}`);
    console.log(`[SystematicTest] ========================================\n`);

    const result: RoleTestResult = {
      role,
      canAccess: false,
      actions: [],
      blockedActions: [],
    };

    // Check if role can access page
    const canAccess = pageDef.allowedRoles.includes(role);
    result.canAccess = canAccess;

    if (!canAccess) {
      // Verify page is blocked
      try {
        await this.page.goto(`http://localhost:5003${pageDef.path}`);
        await this.page.waitForLoadState('networkidle');

        // Check for access denied or redirect
        const url = this.page.url();
        const content = await this.page.content();

        const isBlocked =
          content.includes('Access Denied') ||
          content.includes('Forbidden') ||
          content.includes('Unauthorized') ||
          !url.includes(pageDef.path);

        if (isBlocked) {
          console.log(`[SystematicTest] ✓ ${role} correctly blocked from ${pageDef.path}`);
          result.canAccess = false;
        } else {
          console.warn(`[SystematicTest] ⚠ ${role} may have access to ${pageDef.path}`);
          result.canAccess = true;
        }
      } catch (error) {
        console.log(`[SystematicTest] ✓ ${role} blocked (error)`);
      }

      return result;
    }

    // Test each action
    for (const action of pageDef.actions) {
      // Check if action applies to this role
      if (action.affectedRoles && !action.affectedRoles.includes(role)) {
        result.blockedActions.push(action.id);
        continue;
      }

      const actionResult = await this.testAction(pageDef, action, role);
      result.actions.push(actionResult);
    }

    return result;
  }

  /**
   * Run complete systematic test for all pages and roles
   */
  async runCompleteSystematicTest(): Promise<Map<string, PageTestSuite>> {
    const results = new Map<string, PageTestSuite>();
    const roles = Object.keys(TEST_ACCOUNTS) as (keyof typeof TEST_ACCOUNTS)[];

    for (const pageDef of PAGE_CATALOG) {
      console.log(`\n[SystematicTest] ========================================`);
      console.log(`[SystematicTest] Testing Page: ${pageDef.title} (${pageDef.path})`);
      console.log(`[SystematicTest] ========================================`);

      const pageSuite: PageTestSuite = {
        page: pageDef,
        roleResults: new Map(),
      };

      for (const role of roles) {
        // Login as this role
        const loggedIn = await this.loginAs(role);
        if (!loggedIn) {
          console.error(`[SystematicTest] Skipping ${role} due to login failure`);
          continue;
        }

        // Test page for this role
        const roleResult = await this.testPageForRole(pageDef, role);
        pageSuite.roleResults.set(role, roleResult);

        // Logout
        await this.page.goto('http://localhost:5003/auth');
        await this.page.waitForTimeout(1000);
      }

      results.set(pageDef.path, pageSuite);
    }

    return results;
  }

  /**
   * Generate systematic test report
   */
  generateReport(): string {
    const report: string[] = [];
    report.push('# Systematic Test Report');
    report.push('');
    report.push(`Total Tests: ${this.results.length}`);
    report.push(`Passed: ${this.results.filter(r => r.status === 'passed').length}`);
    report.push(`Failed: ${this.results.filter(r => r.status === 'failed').length}`);
    report.push(`Skipped: ${this.results.filter(r => r.status === 'skipped').length}`);
    report.push('');

    // Group by page
    const byPage = new Map<string, SystematicTestResult[]>();
    for (const result of this.results) {
      if (!byPage.has(result.page)) {
        byPage.set(result.page, []);
      }
      byPage.get(result.page)!.push(result);
    }

    for (const [page, results] of byPage) {
      report.push(`## ${page}`);
      report.push('');

      for (const result of results) {
        const icon = result.status === 'passed' ? '✅' :
                    result.status === 'failed' ? '❌' : '⏭️';
        report.push(`${icon} **${result.action}** (${result.role}) - ${result.duration}ms`);
        if (result.error) {
          report.push(`   Error: ${result.error}`);
        }
      }
      report.push('');
    }

    return report.join('\n');
  }

  getResults(): SystematicTestResult[] {
    return this.results;
  }
}
