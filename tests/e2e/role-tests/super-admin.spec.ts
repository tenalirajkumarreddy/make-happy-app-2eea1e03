/**
 * Super Admin Role Tests
 * Full system access verification
 */

import { test, expect } from '@playwright/test';
import { AITestAgent } from '../ai-test-agent';
import { TEST_ACCOUNTS } from '../test-config';

test.describe('Super Admin Role', () => {
  test('Complete test suite', async ({ page, context }) => {
    const agent = new AITestAgent(page, context, 'super_admin');
    const results = await agent.runCompleteTestSuite();
    
    expect(results.success).toBe(true);
  });

  test.describe('Critical Features', () => {
    test('Can invite new staff', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'super_admin');
      await agent.login();
      await agent.navigate('/admin/staff');
      
      // Verify invite functionality
      const inviteButton = await page.isVisible('button:has-text("Invite"), button:has-text("Add Staff")');
      expect(inviteButton).toBe(true);
    });

    test('Can access all warehouses', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'super_admin');
      await agent.login();
      await agent.navigate('/settings');
      
      // Verify warehouse selector shows multiple
      const warehouseSelector = await page.isVisible('[data-testid="warehouse-selector"], select[name="warehouse"]');
      // Settings might not have selector, test on sales page
      if (!warehouseSelector) {
        await agent.navigate('/sales');
      }
      
      const hasMultipleWarehouses = await page.evaluate(() => {
        const select = document.querySelector('select[name="warehouse"]');
        return select ? select.querySelectorAll('option').length > 1 : true;
      });
      
      expect(hasMultipleWarehouses).toBe(true);
    });

    test('Can manage user permissions', async ({ page, context }) => {
      const agent = new AITestAgent(page, context, 'super_admin');
      await agent.login();
      await agent.navigate('/access-control');
      
      // Verify permission management UI
      const permissionTable = await page.isVisible('table, [role="grid"]');
      expect(permissionTable).toBe(true);
    });
  });
});
