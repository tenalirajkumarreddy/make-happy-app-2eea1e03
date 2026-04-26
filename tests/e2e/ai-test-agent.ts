/**
 * AI Test Agent
 * Intelligent testing using Playwright with decision-making capabilities
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { TEST_CONFIG, TEST_ACCOUNTS, ROLE_ACCESS_MATRIX, TEST_SCENARIOS } from './test-config';

export interface TestResult {
  success: boolean;
  role: string;
  scenario: string;
  steps: TestStepResult[];
  screenshots: string[];
  errors: string[];
  duration: number;
}

export interface TestStepResult {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
  screenshot?: string;
}

export class AITestAgent {
  private page: Page;
  private context: BrowserContext;
  private role: string;
  private account: typeof TEST_ACCOUNTS[keyof typeof TEST_ACCOUNTS];
  private results: TestResult;
  private screenshots: string[] = [];

  constructor(page: Page, context: BrowserContext, role: keyof typeof TEST_ACCOUNTS) {
    this.page = page;
    this.context = context;
    this.role = role;
    this.account = TEST_ACCOUNTS[role];
    this.results = {
      success: false,
      role,
      scenario: '',
      steps: [],
      screenshots: [],
      errors: [],
      duration: 0,
    };
  }

  /**
   * Smart wait with polling for element
   */
  async smartWait(selector: string, timeout: number = 10000): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Take screenshot with metadata
   */
  async takeScreenshot(name: string): Promise<string> {
    const screenshotPath = `tests/e2e/screenshots/${this.role}_${name}_${Date.now()}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.screenshots.push(screenshotPath);
    return screenshotPath;
  }

  /**
   * Log test step result
   */
  private logStep(step: string, success: boolean, duration: number, error?: string) {
    this.results.steps.push({
      step,
      success,
      duration,
      error,
      screenshot: this.screenshots[this.screenshots.length - 1],
    });
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string): Promise<TestStepResult> {
    const startTime = Date.now();
    try {
      await this.page.goto(`${TEST_CONFIG.baseURL}${url}`);
      await this.page.waitForLoadState('networkidle');
      const duration = Date.now() - startTime;
      this.logStep(`Navigate to ${url}`, true, duration);
      return { step: `Navigate to ${url}`, success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logStep(`Navigate to ${url}`, false, duration, errorMsg);
      return { step: `Navigate to ${url}`, success: false, duration, error: errorMsg };
    }
  }

  /**
   * Login with OTP flow
   */
  async login(): Promise<TestStepResult> {
    const startTime = Date.now();
    try {
      // Navigate to auth page
      await this.navigate('/auth');
      
      // Check if already logged in
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/auth')) {
        console.log(`[${this.role}] Already logged in`);
        return { step: 'Login', success: true, duration: Date.now() - startTime };
      }

      // Wait for phone input
      const phoneInput = await this.smartWait('input[type="tel"], input[placeholder*="phone"], input[name="phone"]');
      if (!phoneInput) {
        throw new Error('Phone input not found');
      }

      // Enter phone number
      await this.page.fill('input[type="tel"], input[placeholder*="phone"], input[name="phone"]', this.account.phone);
      
      // Click submit/send OTP
      await this.page.click('button[type="submit"], button:has-text("Send"), button:has-text("Continue")');
      
      // Wait for OTP input
      await this.smartWait('input[type="text"][maxlength="6"], input[placeholder*="OTP"], input[name="otp"]', 15000);
      
      // Get OTP from database or use stored one
      const otp = this.account.otp || await this.fetchOTPFromDatabase();
      if (!otp) {
        throw new Error('No OTP available');
      }

      // Enter OTP
      await this.page.fill('input[type="text"][maxlength="6"], input[placeholder*="OTP"], input[name="otp"]', otp);
      
      // Submit OTP
      await this.page.click('button[type="submit"], button:has-text("Verify")');
      
      // Wait for dashboard
      await this.smartWait('[data-testid="dashboard"], .dashboard, h1:has-text("Dashboard")', 10000);
      
      // Verify login success
      const dashboardVisible = await this.page.isVisible('text=/Dashboard|Welcome|Home/i');
      if (!dashboardVisible) {
        throw new Error('Dashboard not visible after login');
      }

      // Take screenshot
      await this.takeScreenshot('logged_in');

      const duration = Date.now() - startTime;
      this.logStep('Login', true, duration);
      return { step: 'Login', success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.takeScreenshot('login_failed');
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logStep('Login', false, duration, errorMsg);
      return { step: 'Login', success: false, duration, error: errorMsg };
    }
  }

  /**
   * Fetch OTP from database (requires Supabase connection)
   */
  private async fetchOTPFromDatabase(): Promise<string | null> {
    // In real implementation, query Supabase otp_sessions table
    // For now, return the stored OTP
    return this.account.otp || null;
  }

  /**
   * Test page access
   */
  async testPageAccess(page: string, shouldAllow: boolean): Promise<TestStepResult> {
    const startTime = Date.now();
    try {
      await this.navigate(page);
      
      // Check if access was granted or denied
      const currentUrl = this.page.url();
      const hasAccess = !currentUrl.includes('/auth') && !currentUrl.includes('/not-found');
      
      // Check for access denied message
      const accessDenied = await this.page.isVisible('text=/Access Denied|Unauthorized|Forbidden/i');
      
      const actualAccess = hasAccess && !accessDenied;
      const success = actualAccess === shouldAllow;

      const duration = Date.now() - startTime;
      
      if (success) {
        this.logStep(`Page access: ${page} (expected: ${shouldAllow ? 'allow' : 'deny'})`, true, duration);
      } else {
        const error = `Expected ${shouldAllow ? 'access' : 'denial'} but got ${actualAccess ? 'access' : 'denial'}`;
        this.logStep(`Page access: ${page}`, false, duration, error);
      }
      
      return { 
        step: `Page access: ${page}`, 
        success, 
        duration,
        error: success ? undefined : `Expected ${shouldAllow ? 'allow' : 'deny'} but got ${actualAccess ? 'allow' : 'deny'}`
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logStep(`Page access: ${page}`, false, duration, errorMsg);
      return { step: `Page access: ${page}`, success: false, duration, error: errorMsg };
    }
  }

  /**
   * Test element visibility
   */
  async testElementVisibility(selector: string, shouldBeVisible: boolean, name: string): Promise<TestStepResult> {
    const startTime = Date.now();
    try {
      const isVisible = await this.page.isVisible(selector);
      const success = isVisible === shouldBeVisible;
      
      const duration = Date.now() - startTime;
      
      if (success) {
        this.logStep(`Element ${name}: ${shouldBeVisible ? 'visible' : 'hidden'}`, true, duration);
      } else {
        const error = `Expected ${shouldBeVisible ? 'visible' : 'hidden'} but got ${isVisible ? 'visible' : 'hidden'}`;
        this.logStep(`Element ${name}`, false, duration, error);
      }
      
      return { 
        step: `Element visibility: ${name}`, 
        success, 
        duration,
        error: success ? undefined : `Expected ${shouldBeVisible ? 'visible' : 'hidden'}`
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logStep(`Element ${name}`, false, duration, errorMsg);
      return { step: `Element visibility: ${name}`, success: false, duration, error: errorMsg };
    }
  }

  /**
   * Test data creation
   */
  async testCreateAction(
    page: string, 
    createButtonSelector: string,
    formSelectors: Record<string, string>,
    testData: Record<string, string>
  ): Promise<TestStepResult> {
    const startTime = Date.now();
    try {
      await this.navigate(page);
      
      // Click create button
      await this.page.click(createButtonSelector);
      
      // Wait for form
      await this.page.waitForSelector('form, [role="dialog"]', { timeout: 5000 });
      
      // Fill form fields
      for (const [field, value] of Object.entries(testData)) {
        const selector = formSelectors[field];
        if (selector) {
          await this.page.fill(selector, value);
        }
      }
      
      // Submit
      await this.page.click('button[type="submit"], button:has-text("Save")');
      
      // Wait for success
      const successToast = await this.smartWait('[role="status"], .toast-success, text=/success|created/i', 5000);
      
      const duration = Date.now() - startTime;
      
      if (successToast) {
        this.logStep(`Create action on ${page}`, true, duration);
        return { step: `Create action: ${page}`, success: true, duration };
      } else {
        const error = 'Success message not found';
        this.logStep(`Create action: ${page}`, false, duration, error);
        return { step: `Create action: ${page}`, success: false, duration, error };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logStep(`Create action: ${page}`, false, duration, errorMsg);
      return { step: `Create action: ${page}`, success: false, duration, error: errorMsg };
    }
  }

  /**
   * Get test results
   */
  getResults(): TestResult {
    this.results.screenshots = this.screenshots;
    this.results.success = this.results.steps.every(s => s.success);
    return this.results;
  }

  /**
   * Run complete test suite for this role
   */
  async runCompleteTestSuite(): Promise<TestResult> {
    const startTime = Date.now();
    
    console.log(`\n🤖 Starting AI Test Suite for: ${this.role.toUpperCase()}`);
    console.log(`   Account: ${this.account.name} (${this.account.phone})`);
    console.log(`   Description: ${this.account.description}\n`);

    // 1. Login test
    const loginResult = await this.login();
    
    if (!loginResult.success) {
      console.log(`❌ Login failed for ${this.role}, aborting tests`);
      this.results.duration = Date.now() - startTime;
      return this.getResults();
    }

    // 2. Get expected access for this role
    const roleAccess = ROLE_ACCESS_MATRIX[this.role as keyof typeof ROLE_ACCESS_MATRIX];
    if (!roleAccess) {
      console.log(`⚠️ No access matrix defined for role: ${this.role}`);
      this.results.duration = Date.now() - startTime;
      return this.getResults();
    }

    // 3. Test page access for allowed pages
    console.log(`\n📄 Testing allowed pages...`);
    for (const page of roleAccess.allowedPages) {
      const result = await this.testPageAccess(page, true);
      console.log(`   ${result.success ? '✅' : '❌'} ${page}`);
    }

    // 4. Test blocked pages (sample)
    const blockedPages = this.getBlockedPages(roleAccess.allowedPages);
    console.log(`\n🚫 Testing blocked pages...`);
    for (const page of blockedPages.slice(0, 3)) { // Test first 3 blocked
      const result = await this.testPageAccess(page, false);
      console.log(`   ${result.success ? '✅' : '❌'} ${page}`);
    }

    // 5. Test navigation visibility
    console.log(`\n🧭 Testing navigation...`);
    await this.testNavigation(roleAccess);

    // 6. Test specific features based on role
    await this.testRoleSpecificFeatures(roleAccess);

    this.results.duration = Date.now() - startTime;
    
    // Print summary
    this.printSummary();
    
    return this.getResults();
  }

  /**
   * Get blocked pages (pages not in allowed list)
   */
  private getBlockedPages(allowedPages: string[]): string[] {
    const allPages = new Set([
      '/products', '/inventory', '/vendors', '/customers', '/stores',
      '/routes', '/sales', '/transactions', '/orders', '/handovers',
      '/reports', '/analytics', '/activity', '/access-control', '/staff',
      '/attendance', '/invoices', '/expenses', '/banners', '/settings',
      '/admin/setup', '/hr/staff', '/hr/payroll', '/production',
      '/map', '/profile',
    ]);
    
    return Array.from(allPages).filter(page => !allowedPages.includes(page));
  }

  /**
   * Test navigation visibility
   */
  private async testNavigation(roleAccess: typeof ROLE_ACCESS_MATRIX[keyof typeof ROLE_ACCESS_MATRIX]): Promise<void> {
    // Check for dashboard
    await this.testElementVisibility('nav, [role="navigation"], .sidebar', true, 'Navigation sidebar');
    
    // Check for specific nav items based on role
    if (roleAccess.allowedPages.includes('/sales')) {
      await this.testElementVisibility('text=/Sales/i', true, 'Sales nav item');
    }
    if (roleAccess.allowedPages.includes('/inventory')) {
      await this.testElementVisibility('text=/Inventory/i', true, 'Inventory nav item');
    }
    if (roleAccess.allowedPages.includes('/orders')) {
      await this.testElementVisibility('text=/Orders/i', true, 'Orders nav item');
    }
  }

  /**
   * Test role-specific features
   */
  private async testRoleSpecificFeatures(roleAccess: typeof ROLE_ACCESS_MATRIX[keyof typeof ROLE_ACCESS_MATRIX]): Promise<void> {
    console.log(`\n🎯 Testing ${this.role}-specific features...`);
    
    // Test warehouse scoping for manager/agent/operator
    if (!roleAccess.canAccessAllWarehouses && 'canAccessAllWarehouses' in roleAccess) {
      await this.testWarehouseScoping();
    }
    
    // Test POS-only behavior for operator
    if ('posOnly' in roleAccess && roleAccess.posOnly) {
      await this.testPOSOnlyBehavior();
    }
    
    // Test route restriction for agent
    if ('routeRestricted' in roleAccess && roleAccess.routeRestricted) {
      await this.testRouteRestriction();
    }
    
    // Test attendance for operator
    if ('attendanceManagement' in roleAccess && roleAccess.attendanceManagement) {
      await this.testAttendanceAccess();
    }
  }

  /**
   * Test warehouse scoping
   */
  private async testWarehouseScoping(): Promise<void> {
    console.log('   Testing warehouse scoping...');
    // Navigate to a page with warehouse data
    await this.navigate('/sales');
    
    // Check if warehouse selector exists
    const hasWarehouseSelector = await this.smartWait('[data-testid="warehouse-selector"], select[name="warehouse"], .warehouse-select');
    
    if (hasWarehouseSelector) {
      // Check if only one warehouse is shown (assigned warehouse)
      const warehouseOptions = await this.page.$$eval('option', opts => opts.length);
      console.log(`   ${warehouseOptions > 1 ? '❌' : '✅'} Warehouse scoping: ${warehouseOptions} option(s)`);
    }
  }

  /**
   * Test POS-only behavior
   */
  private async testPOSOnlyBehavior(): Promise<void> {
    console.log('   Testing POS-only behavior...');
    await this.navigate('/sales');
    
    // Check if store selector is disabled or locked
    const storeSelector = await this.smartWait('[data-testid="store-selector"], select[name="store"]');
    
    if (storeSelector) {
      // Check if store is pre-selected and disabled
      const isDisabled = await this.page.evaluate(() => {
        const select = document.querySelector('select[name="store"]');
        return select?.hasAttribute('disabled') || select?.classList.contains('disabled');
      });
      
      console.log(`   ${isDisabled ? '✅' : '❌'} Store selector locked: ${isDisabled}`);
    }
  }

  /**
   * Test route restriction
   */
  private async testRouteRestriction(): Promise<void> {
    console.log('   Testing route restriction...');
    await this.navigate('/routes');
    
    // Check for route access matrix or restricted message
    const hasRestriction = await this.page.isVisible('text=/not assigned|no routes|restricted/i');
    const hasRoutesList = await this.page.isVisible('text=/Route|My Routes/i');
    
    console.log(`   ${!hasRestriction && hasRoutesList ? '✅' : '⚠️'} Routes visible: ${hasRoutesList}`);
  }

  /**
   * Test attendance access
   */
  private async testAttendanceAccess(): Promise<void> {
    console.log('   Testing attendance access...');
    const result = await this.testPageAccess('/attendance', true);
    console.log(`   ${result.success ? '✅' : '❌'} Attendance page accessible`);
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    console.log(`\n📊 Test Summary for ${this.role.toUpperCase()}:`);
    console.log(`   Total Steps: ${this.results.steps.length}`);
    console.log(`   Passed: ${this.results.steps.filter(s => s.success).length}`);
    console.log(`   Failed: ${this.results.steps.filter(s => !s.success).length}`);
    console.log(`   Duration: ${this.results.duration}ms`);
    console.log(`   Screenshots: ${this.screenshots.length}`);
    
    if (this.results.steps.some(s => !s.success)) {
      console.log(`\n   ❌ Failed Steps:`);
      this.results.steps.filter(s => !s.success).forEach(s => {
        console.log(`      - ${s.step}: ${s.error}`);
      });
    }
    
    console.log(`\n${'='.repeat(60)}\n`);
  }
}

export default AITestAgent;
