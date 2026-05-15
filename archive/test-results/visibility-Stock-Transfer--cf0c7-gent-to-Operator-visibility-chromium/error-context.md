# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visibility.spec.ts >> Stock Transfer Visibility Test >> Agent to Operator visibility
- Location: tests\e2e\visibility.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5000/auth
Call log:
  - navigating to "http://localhost:5000/auth", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Stock Transfer Visibility Test', () => {
  4  |   test('Agent to Operator visibility', async ({ browser }) => {
  5  |     // 1. Agent logs in
  6  |     const agentContext = await browser.newContext();
  7  |     const agentPage = await agentContext.newPage();
> 8  |     await agentPage.goto('http://localhost:5000/auth');
     |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5000/auth
  9  |     console.log("Agent navigating to auth...");
  10 |     await agentPage.fill('input[type="tel"]', '9879879870');
  11 |     await agentPage.click('button:has-text("Continue")');
  12 |     await agentPage.waitForTimeout(2000);
  13 |     await agentPage.fill('input[type="text"]', '000000');
  14 |     await agentPage.click('button:has-text("Verify")');
  15 |     await agentPage.waitForURL('**/dashboard', { timeout: 10000 });
  16 |     console.log("Agent logged in.");
  17 | 
  18 |     // Go to stock transfers
  19 |     await agentPage.goto('http://localhost:5000/stock-transfers');
  20 |     await agentPage.waitForTimeout(2000);
  21 |     await agentPage.screenshot({ path: 'agent_stock_transfers.png' });
  22 |     console.log("Agent stock transfers screenshot taken.");
  23 | 
  24 |     // 2. Operator logs in
  25 |     const opContext = await browser.newContext();
  26 |     const opPage = await opContext.newPage();
  27 |     await opPage.goto('http://localhost:5000/auth');
  28 |     console.log("Operator navigating to auth...");
  29 |     await opPage.fill('input[type="tel"]', '8888888888');
  30 |     await opPage.click('button:has-text("Continue")');
  31 |     await opPage.waitForTimeout(2000);
  32 |     await opPage.fill('input[type="text"]', '000000');
  33 |     await opPage.click('button:has-text("Verify")');
  34 |     await opPage.waitForURL('**/dashboard', { timeout: 10000 });
  35 |     console.log("Operator logged in.");
  36 | 
  37 |     // Go to stock transfers
  38 |     await opPage.goto('http://localhost:5000/stock-transfers');
  39 |     await opPage.waitForTimeout(2000);
  40 |     await opPage.screenshot({ path: 'op_stock_transfers.png' });
  41 |     console.log("Operator stock transfers screenshot taken.");
  42 | 
  43 |     // Check notifications
  44 |     await opPage.click('button[aria-label*="Notification"]'); // Need exact selector, skip for now or use topbar icon
  45 |     await opPage.waitForTimeout(1000);
  46 |     await opPage.screenshot({ path: 'op_notifications.png' });
  47 |   });
  48 | });
  49 | 
```