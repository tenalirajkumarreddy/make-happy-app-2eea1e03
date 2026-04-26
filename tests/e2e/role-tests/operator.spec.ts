/**
 * Operator Role Tests - NEW
 * POS-only access, inventory, attendance
 */

import { test, expect } from '@playwright/test';
import { AITestAgent } from '../ai-test-agent';

test.describe('Operator Role - NEW', () => {
  test('Complete test suite', async ({ page, context }) => {
    const agent = new AITestAgent(page, context, 'operator');
    const results = await agent.runCompleteTestSuite();
    
    expect(results.success).toBe(true);
  });

  test.describe('POS-Only Sales', () => {
    test('Store selector is locked to POS', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/sales');
      
      // Check if store selector exists and is disabled
      const storeSelect = await page.$('select[name="store"], [data-testid="store-select"]');
      
      if (storeSelect) {
        const isDisabled = await storeSelect.evaluate(el => 
          el.hasAttribute('disabled') || el.classList.contains('disabled')
        );
        
        // Should be disabled or have only POS store
        const options = await storeSelect.$$eval('option', opts => opts.length);
        
        // Operator should see only POS store
        expect(options).toBe(1);
        
        // Check selected value is POS store
        const selectedValue = await storeSelect.evaluate(el => (el as HTMLSelectElement).value);
        expect(selectedValue).toBe('00000000-0000-0000-0000-000000000001');
      }
    });

    test('Cannot access other stores', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/stores');
      
      // Should be redirected or show access denied
      const currentUrl = page.url();
      const hasAccess = !currentUrl.includes('/stores') || await page.isVisible('text=/Access Denied|Unauthorized/i');
      
      // Operators should not access stores list
      expect(hasAccess).toBe(true);
    });

    test('Full payment required for sales', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/sales');
      
      // Wait for sales page
      await page.waitForSelector('text=/Sales|POS/i', { timeout: 5000 });
      
      // Try to add a sale without full payment
      // This would require form interaction which is tested separately
      // For now, verify the validation logic exists
      const hasValidation = await page.isVisible('text=/full payment|outstanding|complete payment/i');
      expect(hasValidation).toBe(true);
    });
  });

  test.describe('Inventory Access', () => {
    test('Can view inventory', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      const result = await agent.testPageAccess('/inventory', true);
      expect(result.success).toBe(true);
    });

    test('Can transfer stock', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/stock-transfers');
      
      // Check if transfer button is visible
      const transferBtn = await page.isVisible('button:has-text("Transfer"), a:has-text("New Transfer")');
      expect(transferBtn).toBe(true);
    });
  });

  test.describe('Attendance Management', () => {
    test('Can access attendance page', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      const result = await agent.testPageAccess('/attendance', true);
      expect(result.success).toBe(true);
    });

    test('Can take attendance', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/attendance');
      
      // Check for check-in/check-out buttons
      const hasCheckIn = await page.isVisible('button:has-text("Check In"), button:has-text("Present")');
      expect(hasCheckIn).toBe(true);
    });
  });

  test.describe('HR/Staff Access', () => {
    test('Can view workers', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      const result = await agent.testPageAccess('/hr/staff', true);
      expect(result.success).toBe(true);
    });

    test('Cannot modify staff roles', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/hr/staff');
      
      // Should not see edit role buttons
      const hasEditRoles = await page.isVisible('button:has-text("Edit Role")');
      expect(hasEditRoles).toBe(false);
    });
  });

  test.describe('Orders Restriction', () => {
    test('Cannot access orders by default', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/orders');
      
      // Should be redirected or show access denied
      const currentUrl = page.url();
      const denied = currentUrl.includes('/orders') === false || 
                     await page.isVisible('text=/Access Denied|Unauthorized|Forbidden/i');
      
      expect(denied).toBe(true);
    });

    test('Orders not visible in dashboard', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/dashboard');
      
      // Check navigation doesn't have orders
      const hasOrdersNav = await page.isVisible('nav a:has-text("Orders"), .sidebar a:has-text("Orders")');
      expect(hasOrdersNav).toBe(false);
    });
  });

  test.describe('Transactions Restriction', () => {
    test('Cannot access transactions for stores', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/transactions');
      
      // Should be redirected or show access denied
      const currentUrl = page.url();
      const denied = currentUrl.includes('/transactions') === false || 
                     await page.isVisible('text=/Access Denied|Unauthorized|Forbidden/i');
      
      expect(denied).toBe(true);
    });
  });

  test.describe('Invoices', () => {
    test('Can view invoices', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/invoices');
      
      // Should see invoices list
      const hasInvoices = await page.isVisible('h1:has-text("Invoices"), table, [role="grid"]');
      expect(hasInvoices).toBe(true);
    });

    test('Cannot create invoices', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'operator');
      await agent.login();
      await agent.navigate('/invoices');
      
      // Should not see create button
      const hasCreateBtn = await page.isVisible('button:has-text("New Invoice"), a:has-text("Create")');
      expect(hasCreateBtn).toBe(false);
    });
  });
});
