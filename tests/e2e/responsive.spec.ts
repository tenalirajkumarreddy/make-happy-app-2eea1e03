import { test, expect } from '@playwright/test';
import { TEST_CONFIG, TEST_ACCOUNTS } from './test-config';

const VIEWPORTS = [
  { width: 320, height: 568, name: '320px (iPhone SE)' },
  { width: 375, height: 667, name: '375px (iPhone 8)' },
  { width: 390, height: 844, name: '390px (iPhone 14)' },
  { width: 480, height: 800, name: '480px (xs breakpoint)' },
  { width: 640, height: 960, name: '640px (sm breakpoint)' },
  { width: 768, height: 1024, name: '768px (md breakpoint)' },
  { width: 1024, height: 768, name: '1024px (lg breakpoint)' },
  { width: 1280, height: 800, name: '1280px (xl breakpoint)' },
  { width: 1440, height: 900, name: '1440px (desktop)' },
  { width: 1920, height: 1080, name: '1920px (full HD)' },
];

// Pages to test (uses auth-required pages — skip auth page itself)
const PAGES = [
  { path: '/dashboard', role: 'super_admin' },
  { path: '/sales', role: 'super_admin' },
  { path: '/transactions', role: 'super_admin' },
  { path: '/orders', role: 'super_admin' },
  { path: '/customers', role: 'super_admin' },
  { path: '/stores', role: 'super_admin' },
  { path: '/inventory', role: 'super_admin' },
  { path: '/reports', role: 'super_admin' },
];

// Skip auth page mobile test — it's simple
test.describe('Responsive Layout Audit', () => {
  let isAuthenticated = false;

  test.beforeAll(async ({ browser }) => {
    // Authenticate once, reuse across viewport tests
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(TEST_CONFIG.baseURL || 'http://localhost:5000/auth');

    // Step 1: Enter phone number and send OTP
    await page.fill('#phone', TEST_ACCOUNTS.super_admin.phone);
    await page.click('button:has-text("Send OTP")');

    // Step 2: Wait for OTP form to appear, then enter OTP
    await page.waitForSelector('#otp', { timeout: 15000 });
    await page.fill('#otp', TEST_ACCOUNTS.super_admin.otp);
    await page.click('button:has-text("Verify OTP")');

    // Step 3: Wait for redirect to root (which forwards to dashboard)
    await page.waitForURL(url => url.pathname === '/' || url.pathname.startsWith('/dashboard'), { timeout: 20000 });
    await page.context().storageState({ path: 'tests/e2e/.auth.json' });
    await ctx.close();
  });

  for (const pageInfo of PAGES) {
    test.describe(`${pageInfo.path}`, () => {
      for (const vp of VIEWPORTS) {
        test(`@${vp.width}px — ${vp.name}`, async ({ browser }) => {
          const ctx = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            storageState: 'tests/e2e/.auth.json',
          });
          const page = await ctx.newPage();

          // Suppress analytics/monitoring noise
          await page.route('**/log/**', (route) => route.abort());
          await page.route('**/realtime/**', (route) => route.abort());

          await page.goto(`${TEST_CONFIG.baseURL || 'http://localhost:5000'}${pageInfo.path}`, {
            waitUntil: 'networkidle',
            timeout: 30000,
          });

          // Wait for content to render
          await page.waitForTimeout(2000);

          // Test 1: No horizontal overflow
          const overflowJs = `
            const d = document.documentElement;
            const scrollW = Math.max(d.scrollWidth, d.offsetWidth, d.clientWidth);
            const bodyScrollW = Math.max(document.body.scrollWidth, document.body.offsetWidth);
            const maxScroll = Math.max(scrollW, bodyScrollW);
            maxScroll - window.innerWidth;
          `;
          const overflowPx = await page.evaluate(overflowJs);
          expect(
            overflowPx,
            `${pageInfo.path} @ ${vp.width}px should not have horizontal overflow`
          ).toBeLessThanOrEqual(1);

          // Test 2: Check for visible elements overflowing viewport
          const overflowElements = await page.evaluate(() => {
            const overflows: string[] = [];
            const w = window.innerWidth;
            document.querySelectorAll('body *').forEach((el) => {
              if (el instanceof HTMLElement && el.offsetParent !== null) {
                const rect = el.getBoundingClientRect();
                if (rect.right > w + 5 && rect.width > 10) {
                  const tag = el.tagName.toLowerCase();
                  const cls = (el.className && typeof el.className === 'string')
                    ? el.className.split(' ').slice(0, 2).join('.') : '';
                  overflows.push(`${tag}.${cls} (right: ${Math.round(rect.right)}, w: ${Math.round(rect.width)})`);
                }
              }
            });
            return overflows.slice(0, 10); // Top 10
          });
          expect(
            overflowElements,
            `${pageInfo.path} @ ${vp.width}px: ${overflowElements.join(', ')}`
          ).toHaveLength(0);

          // Test 3: Touch target check (mobile only)
          if (vp.width < 768) {
            const smallTargets = await page.evaluate(() => {
              const small: string[] = [];
              document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
                if (el instanceof HTMLElement) {
                  const r = el.getBoundingClientRect();
                  if (r.width > 0 && r.height > 0 && r.width < 44 && r.height < 44) {
                    const text = (el.textContent || '').trim().slice(0, 40);
                    small.push(`${el.tagName.toLowerCase()} "${text}" (${Math.round(r.width)}x${Math.round(r.height)})`);
                  }
                }
              });
              return small.slice(0, 10);
            });
            if (smallTargets.length > 0) {
              console.log(`  ⚠ ${pageInfo.path} @ ${vp.width}px: ${smallTargets.length} small touch targets`);
              smallTargets.forEach((t) => console.log(`    ${t}`));
            }
          }

          await ctx.close();
        });
      }
    });
  }
});
