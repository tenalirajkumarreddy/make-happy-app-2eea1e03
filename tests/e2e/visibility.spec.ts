import { test, expect } from '@playwright/test';

test.describe('Stock Transfer Visibility Test', () => {
  test('Agent to Operator visibility', async ({ browser }) => {
    // 1. Agent logs in
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();
    await agentPage.goto('http://localhost:5000/auth');
    console.log("Agent navigating to auth...");
    await agentPage.fill('input[type="tel"]', '9879879870');
    await agentPage.click('button:has-text("Continue")');
    await agentPage.waitForTimeout(2000);
    await agentPage.fill('input[type="text"]', '000000');
    await agentPage.click('button:has-text("Verify")');
    await agentPage.waitForURL('**/dashboard', { timeout: 10000 });
    console.log("Agent logged in.");

    // Go to stock transfers
    await agentPage.goto('http://localhost:5000/stock-transfers');
    await agentPage.waitForTimeout(2000);
    await agentPage.screenshot({ path: 'agent_stock_transfers.png' });
    console.log("Agent stock transfers screenshot taken.");

    // 2. Operator logs in
    const opContext = await browser.newContext();
    const opPage = await opContext.newPage();
    await opPage.goto('http://localhost:5000/auth');
    console.log("Operator navigating to auth...");
    await opPage.fill('input[type="tel"]', '8888888888');
    await opPage.click('button:has-text("Continue")');
    await opPage.waitForTimeout(2000);
    await opPage.fill('input[type="text"]', '000000');
    await opPage.click('button:has-text("Verify")');
    await opPage.waitForURL('**/dashboard', { timeout: 10000 });
    console.log("Operator logged in.");

    // Go to stock transfers
    await opPage.goto('http://localhost:5000/stock-transfers');
    await opPage.waitForTimeout(2000);
    await opPage.screenshot({ path: 'op_stock_transfers.png' });
    console.log("Operator stock transfers screenshot taken.");

    // Check notifications
    await opPage.click('button[aria-label*="Notification"]'); // Need exact selector, skip for now or use topbar icon
    await opPage.waitForTimeout(1000);
    await opPage.screenshot({ path: 'op_notifications.png' });
  });
});
