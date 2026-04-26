/**
 * Automated E2E Test Runner
 * Runs comprehensive tests for all roles and generates report
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { AITestAgent, TestResult } from './ai-test-agent';
import { TEST_ACCOUNTS, TEST_CONFIG } from './test-config';
import * as fs from 'fs';
import * as path from 'path';

export class TestRunner {
  private browser: Browser | null = null;
  private results: Map<string, TestResult> = new Map();
  private startTime: number = 0;

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Test Runner...\n');
    
    this.browser = await chromium.launch({
      headless: TEST_CONFIG.headless,
      slowMo: TEST_CONFIG.slowMo,
    });

    // Ensure screenshots directory exists
    const screenshotsDir = path.join(process.cwd(), 'tests', 'e2e', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  }

  async runAllTests(): Promise<Map<string, TestResult>> {
    this.startTime = Date.now();
    
    const roles = Object.keys(TEST_ACCOUNTS) as Array<keyof typeof TEST_ACCOUNTS>;
    
    console.log(`🎯 Testing ${roles.length} roles:\n`);
    console.log('─'.repeat(70));
    
    for (const role of roles) {
      // Skip customer for now (separate portal)
      if (role === 'customer') continue;
      
      const context = await this.browser!.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: 'tests/e2e/videos/' },
      });
      
      const page = await context.newPage();
      const agent = new AITestAgent(page, context, role);
      
      try {
        const result = await agent.runCompleteTestSuite();
        this.results.set(role, result);
      } catch (error) {
        console.error(`❌ Test failed for ${role}:`, error);
        this.results.set(role, {
          success: false,
          role,
          scenario: 'Complete Suite',
          steps: [],
          screenshots: [],
          errors: [String(error)],
          duration: 0,
        });
      }
      
      await context.close();
      
      // Delay between tests to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }
    
    return this.results;
  }

  generateReport(): string {
    const totalDuration = Date.now() - this.startTime;
    const results = Array.from(this.results.values());
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;
    
    // Calculate per-role stats
    const roleStats = results.map(r => ({
      role: r.role,
      success: r.success,
      duration: r.duration,
      stepsPassed: r.steps.filter(s => s.success).length,
      stepsFailed: r.steps.filter(s => !s.success).length,
      totalSteps: r.steps.length,
      screenshots: r.screenshots.length,
    }));
    
    // Generate HTML report
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>E2E Test Report - ${new Date().toLocaleString()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
    .stat-box.pass { border-left: 4px solid #22c55e; }
    .stat-box.fail { border-left: 4px solid #ef4444; }
    .stat-number { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
    .stat-label { color: #666; font-size: 14px; }
    .role-card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .role-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .role-name { font-size: 18px; font-weight: bold; }
    .role-status { padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .role-status.pass { background: #dcfce7; color: #166534; }
    .role-status.fail { background: #fee2e2; color: #991b1b; }
    .steps-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .steps-table th { text-align: left; padding: 10px; background: #f8fafc; font-weight: 600; }
    .steps-table td { padding: 10px; border-top: 1px solid #e2e8f0; }
    .step-status { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    .step-status.pass { background: #dcfce7; color: #166534; }
    .step-status.fail { background: #fee2e2; color: #991b1b; }
    .error-message { color: #ef4444; font-size: 12px; margin-top: 5px; }
    .duration { color: #666; font-size: 12px; }
    .screenshots { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .screenshot { width: 100px; height: 70px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
    .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .progress-fill { height: 100%; background: #22c55e; transition: width 0.3s; }
    .progress-fill.fail { background: #ef4444; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 AI E2E Test Report</h1>
    <p>Generated: ${new Date().toLocaleString()} | Duration: ${(totalDuration / 1000).toFixed(2)}s</p>
  </div>
  
  <div class="summary">
    <div class="stat-box ${passed === total ? 'pass' : 'fail'}">
      <div class="stat-number" style="color: ${passed === total ? '#22c55e' : '#ef4444'}">${passed}/${total}</div>
      <div class="stat-label">Roles Passed</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${results.reduce((sum, r) => sum + r.steps.length, 0)}</div>
      <div class="stat-label">Total Steps</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${results.reduce((sum, r) => sum + r.steps.filter(s => s.success).length, 0)}</div>
      <div class="stat-label">Steps Passed</div>
    </div>
    <div class="stat-box">
      <div class="stat-number">${results.reduce((sum, r) => sum + r.screenshots.length, 0)}</div>
      <div class="stat-label">Screenshots</div>
    </div>
  </div>

  <h2>Role Test Results</h2>
  
  ${roleStats.map(stat => `
    <div class="role-card">
      <div class="role-header">
        <span class="role-name">${stat.role.toUpperCase()}</span>
        <span class="role-status ${stat.success ? 'pass' : 'fail'}">${stat.success ? '✅ PASSED' : '❌ FAILED'}</span>
      </div>
      
      <div class="duration">Duration: ${(stat.duration / 1000).toFixed(2)}s | Steps: ${stat.stepsPassed}/${stat.totalSteps} passed</div>
      
      <div class="progress-bar">
        <div class="progress-fill ${stat.stepsPassed === stat.totalSteps ? '' : 'fail'}" 
             style="width: ${(stat.stepsPassed / stat.totalSteps) * 100}%"></div>
      </div>
      
      ${stat.stepsFailed > 0 ? `
        <table class="steps-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            ${results.find(r => r.role === stat.role)?.steps.filter(s => !s.success).map(step => `
              <tr>
                <td>${step.step}</td>
                <td><span class="step-status fail">FAILED</span></td>
                <td>${step.duration}ms</td>
                <td class="error-message">${step.error || 'Unknown error'}</td>
              </tr>
            `).join('') || ''}
          </tbody>
        </table>
      ` : ''}
      
      ${stat.screenshots > 0 ? `
        <div class="screenshots">
          ${results.find(r => r.role === stat.role)?.screenshots.slice(0, 5).map(screenshot => `
            <img class="screenshot" src="${path.basename(screenshot)}" alt="Screenshot" />
          `).join('') || ''}
        </div>
      ` : ''}
    </div>
  `).join('')}

</body>
</html>`;

    // Save HTML report
    const reportPath = path.join(process.cwd(), 'tests', 'e2e', 'reports', `test-report-${Date.now()}.html`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, html);

    // Generate console report
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL TEST REPORT');
    console.log('='.repeat(70));
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`Roles Passed: ${passed}/${total}`);
    console.log(`Total Steps: ${results.reduce((sum, r) => sum + r.steps.length, 0)}`);
    console.log(`Steps Passed: ${results.reduce((sum, r) => sum + r.steps.filter(s => s.success).length, 0)}`);
    console.log(`Screenshots: ${results.reduce((sum, r) => sum + r.screenshots.length, 0)}`);
    console.log('='.repeat(70));
    
    console.log('\nRole Summary:');
    roleStats.forEach(stat => {
      const emoji = stat.success ? '✅' : '❌';
      const status = stat.success ? 'PASSED' : 'FAILED';
      const stepsInfo = `${stat.stepsPassed}/${stat.totalSteps} steps`;
      console.log(`  ${emoji} ${stat.role.padEnd(15)} ${status.padEnd(8)} ${stepsInfo.padEnd(15)} ${(stat.duration / 1000).toFixed(2)}s`);
    });
    
    console.log(`\n📄 HTML Report saved to: ${reportPath}`);
    
    return reportPath;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      console.log('\n🧹 Test runner cleanup complete');
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const runner = new TestRunner();
  
  (async () => {
    try {
      await runner.initialize();
      await runner.runAllTests();
      const reportPath = runner.generateReport();
      await runner.cleanup();
      
      console.log(`\n✨ Testing complete! Report: ${reportPath}`);
      process.exit(0);
    } catch (error) {
      console.error('Test runner failed:', error);
      await runner.cleanup();
      process.exit(1);
    }
  })();
}

export default TestRunner;
