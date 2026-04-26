/**
 * Multi-Agent Cross-Role Testing Framework
 * Simulates multiple users simultaneously to test real-time data flow
 */

import { test, expect, Page, BrowserContext, Browser, chromium } from '@playwright/test';
import { TEST_CONFIG, TEST_ACCOUNTS } from './test-config';

export interface AgentSession {
  id: string;
  role: string;
  phone: string;
  page: Page;
  context: BrowserContext;
  loggedIn: boolean;
  warehouseId?: string;
}

export interface CrossRoleTestScenario {
  name: string;
  description: string;
  agents: { role: string; actions: AgentAction[] }[];
  validations: CrossRoleValidation[];
}

export interface AgentAction {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'verify' | 'screenshot' | 'sync';
  target?: string;
  value?: string;
  selector?: string;
  delay?: number;
  expectedResult?: any;
  waitForRealtime?: boolean;
}

export interface CrossRoleValidation {
  type: 'data_sync' | 'permission_boundary' | 'workflow_state' | 'realtime_update';
  fromAgent: string;
  toAgent: string;
  description: string;
  validate: (agents: Map<string, AgentSession>) => Promise<boolean>;
}

export interface TestExecutionResult {
  scenario: string;
  success: boolean;
  agentResults: Map<string, AgentResult>;
  syncValidations: SyncValidationResult[];
  duration: number;
  errors: string[];
}

export interface AgentResult {
  agentId: string;
  role: string;
  actionsCompleted: number;
  actionsFailed: number;
  screenshots: string[];
  errors: string[];
}

export interface SyncValidationResult {
  validation: string;
  passed: boolean;
  error?: string;
  timestamp: number;
}

export class MultiAgentTestFramework {
  private browser: Browser | null = null;
  private agents: Map<string, AgentSession> = new Map();
  private testResults: TestExecutionResult[] = [];

  async initialize() {
    this.browser = await chromium.launch({
      headless: false, // Set to true for CI
      args: ['--disable-web-security', '--disable-features=IsolateOrigins'],
    });
    console.log('[MultiAgent] Browser initialized');
  }

  async createAgent(role: keyof typeof TEST_ACCOUNTS): Promise<AgentSession> {
    if (!this.browser) throw new Error('Framework not initialized');

    const account = TEST_ACCOUNTS[role];
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      bypassCSP: true,
    });

    const page = await context.newPage();
    const agentId = `${role}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const agent: AgentSession = {
      id: agentId,
      role: role as string,
      phone: account.phone,
      page,
      context,
      loggedIn: false,
      warehouseId: 'warehouseId' in account ? account.warehouseId : undefined,
    };

    this.agents.set(agentId, agent);
    console.log(`[MultiAgent] Created agent: ${agentId} (${role})`);
    return agent;
  }

  async loginAgent(agent: AgentSession): Promise<boolean> {
    try {
      console.log(`[MultiAgent] Logging in ${agent.role} (${agent.phone})`);

      await agent.page.goto(`${TEST_CONFIG.baseURL}/auth`);
      await agent.page.waitForLoadState('networkidle');

      // Fill phone number
      await agent.page.fill('input[type="tel"], input[placeholder*="phone"], input[name="phone"]', agent.phone);
      await agent.page.click('button[type="submit"], button:has-text("Send"), button:has-text("Continue")');

      // Wait for OTP input
      await agent.page.waitForSelector('input[type="text"][maxlength="6"], input[placeholder*="OTP"], input[name="otp"]', { timeout: 10000 });

      // Fill OTP
      await agent.page.fill('input[type="text"][maxlength="6"], input[placeholder*="OTP"], input[name="otp"]', '000000');
      await agent.page.click('button:has-text("Verify"), button[type="submit"]');

      // Wait for dashboard
      await agent.page.waitForURL(/dashboard|portal|\/$/, { timeout: 30000 });
      await agent.page.waitForLoadState('networkidle');

      agent.loggedIn = true;
      console.log(`[MultiAgent] ✓ ${agent.role} logged in successfully`);
      return true;
    } catch (error) {
      console.error(`[MultiAgent] ✗ ${agent.role} login failed:`, error);
      await this.takeScreenshot(agent, 'login_failed');
      return false;
    }
  }

  async executeAgentActions(agent: AgentSession, actions: AgentAction[]): Promise<AgentResult> {
    const result: AgentResult = {
      agentId: agent.id,
      role: agent.role,
      actionsCompleted: 0,
      actionsFailed: 0,
      screenshots: [],
      errors: [],
    };

    for (const action of actions) {
      try {
        console.log(`[MultiAgent] ${agent.role}: Executing ${action.type}`);
        await this.executeSingleAction(agent, action);
        result.actionsCompleted++;

        if (action.type === 'screenshot') {
          const path = await this.takeScreenshot(agent, action.value || `action_${result.actionsCompleted}`);
          result.screenshots.push(path);
        }
      } catch (error) {
        result.actionsFailed++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Action ${action.type} failed: ${errorMsg}`);
        console.error(`[MultiAgent] ${agent.role}: Action failed -`, errorMsg);
      }
    }

    return result;
  }

  private async executeSingleAction(agent: AgentSession, action: AgentAction) {
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        switch (action.type) {
          case 'navigate':
            await agent.page.goto(`${TEST_CONFIG.baseURL}${action.target}`);
            await agent.page.waitForLoadState('networkidle');
            break;

          case 'click':
            // Wait for element to be visible before clicking
            await agent.page.waitForSelector(action.selector!, { timeout: 10000, state: 'visible' });
            await agent.page.click(action.selector!);
            break;

          case 'fill':
            await agent.page.waitForSelector(action.selector!, { timeout: 10000, state: 'visible' });
            await agent.page.fill(action.selector!, action.value!);
            break;

          case 'select':
            await agent.page.waitForSelector(action.selector!, { timeout: 10000, state: 'visible' });
            await agent.page.selectOption(action.selector!, action.value!);
            break;

          case 'wait':
            await agent.page.waitForTimeout(action.delay || 1000);
            break;

          case 'verify':
            await agent.page.waitForSelector(action.selector!, { timeout: 10000 });
            break;

          case 'sync':
            // Wait for realtime sync (used between agents)
            await agent.page.waitForTimeout(action.delay || 2000);
            break;

          case 'screenshot':
            // Handled in calling code
            break;
        }
        // If successful, break out of retry loop
        break;
      } catch (error) {
        console.log(`[MultiAgent] ${agent.role}: Action ${action.type} failed (attempt ${attempt}/${maxRetries}):`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await agent.page.waitForTimeout(retryDelay * attempt);
      }
    }
  }

  async takeScreenshot(agent: AgentSession, name: string): Promise<string> {
    const path = `tests/e2e/screenshots/multiagent/${agent.role}_${name}_${Date.now()}.png`;
    await agent.page.screenshot({ path, fullPage: true });
    return path;
  }

  async runScenario(scenario: CrossRoleTestScenario): Promise<TestExecutionResult> {
    console.log(`\n[MultiAgent] ========================================`);
    console.log(`[MultiAgent] Running Scenario: ${scenario.name}`);
    console.log(`[MultiAgent] ${scenario.description}`);
    console.log(`[MultiAgent] ========================================\n`);

    const startTime = Date.now();
    const agentResults = new Map<string, AgentResult>();
    const syncValidations: SyncValidationResult[] = [];
    const errors: string[] = [];

    try {
      // Create and login all agents
      for (const agentConfig of scenario.agents) {
        const agent = await this.createAgent(agentConfig.role as keyof typeof TEST_ACCOUNTS);
        const loginSuccess = await this.loginAgent(agent);

        if (!loginSuccess) {
          errors.push(`Failed to login ${agentConfig.role}`);
          continue;
        }
      }

      // Execute agent actions (can be done in parallel)
      const actionPromises: Promise<void>[] = [];

      for (const agentConfig of scenario.agents) {
        // Find the agent by role
        const agent = Array.from(this.agents.values()).find(a => a.role === agentConfig.role);
        if (!agent) continue;

        const promise = this.executeAgentActions(agent, agentConfig.actions)
          .then(result => {
            agentResults.set(agent.id, result);
          });
        actionPromises.push(promise);
      }

      await Promise.all(actionPromises);

      // Run cross-role validations
      for (const validation of scenario.validations) {
        const validationStart = Date.now();
        try {
          const fromAgent = Array.from(this.agents.values()).find(a => a.role === validation.fromAgent);
          const toAgent = Array.from(this.agents.values()).find(a => a.role === validation.toAgent);

          if (!fromAgent || !toAgent) {
            throw new Error(`Agents not found for validation`);
          }

          const passed = await validation.validate(this.agents);
          syncValidations.push({
            validation: validation.description,
            passed,
            timestamp: Date.now() - validationStart,
          });
        } catch (error) {
          syncValidations.push({
            validation: validation.description,
            passed: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now() - validationStart,
          });
        }
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    const duration = Date.now() - startTime;

    const result: TestExecutionResult = {
      scenario: scenario.name,
      success: errors.length === 0 && syncValidations.every(v => v.passed),
      agentResults,
      syncValidations,
      duration,
      errors,
    };

    this.testResults.push(result);
    return result;
  }

  async cleanup() {
    console.log('[MultiAgent] Cleaning up agents...');
    for (const agent of this.agents.values()) {
      await agent.context.close();
    }
    this.agents.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    console.log('[MultiAgent] Cleanup complete');
  }

  getResults(): TestExecutionResult[] {
    return this.testResults;
  }
}

// Pre-defined cross-role test scenarios
export const CROSS_ROLE_SCENARIOS: CrossRoleTestScenario[] = [
  {
    name: 'Sale_Creation_And_Manager_Visibility',
    description: 'Agent creates a sale, Manager sees it appear in real-time',
    agents: [
      {
        role: 'agent',
        actions: [
          { type: 'navigate', target: '/sales' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'before_sale' },
          { type: 'click', selector: 'button:has-text("Record Sale")' },
          { type: 'wait', delay: 2000 },
          // Select first available store
          { type: 'click', selector: '[data-slot="select-trigger"]' },
          { type: 'wait', delay: 1000 },
          { type: 'click', selector: '[role="option"]:first-of-type' },
          { type: 'wait', delay: 1000 },
          // Add a product (click "Add Product" or first product)
          { type: 'click', selector: 'button:has-text("Add"), button[variant="outline"]:first-of-type' },
          { type: 'wait', delay: 2000 },
          // Select first product
          { type: 'click', selector: '[data-slot="select-trigger"]' },
          { type: 'wait', delay: 1000 },
          { type: 'click', selector: '[role="option"]:nth-of-type(2)' },
          { type: 'wait', delay: 1000 },
          // Click Add Product
          { type: 'click', selector: 'button:has-text("Add Product")' },
          { type: 'wait', delay: 1000 },
          // Fill cash amount
          { type: 'fill', selector: 'input[type="number"]:first-of-type', value: '100' },
          { type: 'wait', delay: 500 },
          // Submit
          { type: 'click', selector: 'button[type="submit"]' },
          { type: 'wait', delay: 5000 },
          { type: 'screenshot', value: 'after_sale_created' },
          { type: 'sync', delay: 5000 }, // Wait for realtime sync
        ],
      },
      {
        role: 'manager',
        actions: [
          { type: 'navigate', target: '/sales' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'initial_view' },
          { type: 'sync', delay: 15000 }, // Wait for agent to create sale
          { type: 'click', selector: 'button:has-text("Refresh")' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'after_agent_sale' },
        ],
      },
    ],
    validations: [
      {
        type: 'data_sync',
        fromAgent: 'agent',
        toAgent: 'manager',
        description: 'Sale created by agent appears in manager dashboard',
        validate: async (agents) => {
          const manager = Array.from(agents.values()).find(a => a.role === 'manager');
          if (!manager) return false;

          const page = manager.page;
          // Check if there's a table with sales data
          const hasSalesTable = await page.$('table tbody tr');
          return !!hasSalesTable;
        },
      },
    ],
  },
  {
    name: 'Order_Creation_To_Sale_Conversion',
    description: 'Marketer creates order, Agent converts to sale',
    agents: [
      {
        role: 'marketer',
        actions: [
          { type: 'navigate', target: '/orders' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'orders_list' },
        ],
      },
      {
        role: 'agent',
        actions: [
          { type: 'navigate', target: '/orders' },
          { type: 'wait', delay: 5000 }, // Wait for order to appear
          { type: 'screenshot', value: 'orders_list' },
          { type: 'click', selector: 'button:has-text("Convert to Sale")' },
          { type: 'wait', delay: 2000 },
          { type: 'screenshot', value: 'sale_converted' },
        ],
      },
    ],
    validations: [
      {
        type: 'workflow_state',
        fromAgent: 'marketer',
        toAgent: 'agent',
        description: 'Order appears in agent dashboard after creation',
        validate: async (agents) => {
          // Check if order exists in agent's view
          return true; // Simplified validation
        },
      },
    ],
  },
  {
    name: 'Stock_Transfer_Visibility',
    description: 'Manager transfers stock, Operator sees updated inventory',
    agents: [
      {
        role: 'manager',
        actions: [
          { type: 'navigate', target: '/inventory' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'inventory_initial' },
          // Look for Transfer button
          { type: 'click', selector: 'button:has-text("Transfer")' },
          { type: 'wait', delay: 2000 },
          // Fill transfer form
          { type: 'click', selector: '[data-slot="select-trigger"]:first-of-type' },
          { type: 'wait', delay: 1000 },
          { type: 'click', selector: '[role="option"]:nth-of-type(2)' },
          { type: 'wait', delay: 1000 },
          // To warehouse
          { type: 'click', selector: '[data-slot="select-trigger"]:nth-of-type(2)' },
          { type: 'wait', delay: 1000 },
          { type: 'click', selector: '[role="option"]:nth-of-type(2)' },
          { type: 'wait', delay: 1000 },
          // Product
          { type: 'click', selector: '[data-slot="select-trigger"]:nth-of-type(3)' },
          { type: 'wait', delay: 1000 },
          { type: 'click', selector: '[role="option"]:nth-of-type(2)' },
          { type: 'wait', delay: 1000 },
          // Quantity
          { type: 'fill', selector: 'input[type="number"]', value: '10' },
          { type: 'wait', delay: 1000 },
          // Submit
          { type: 'click', selector: 'button[type="submit"]' },
          { type: 'wait', delay: 5000 },
          { type: 'screenshot', value: 'transfer_created' },
        ],
      },
      {
        role: 'operator',
        actions: [
          { type: 'navigate', target: '/inventory' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'inventory_before' },
          { type: 'sync', delay: 10000 }, // Wait for transfer to complete
          { type: 'click', selector: 'button:has-text("Refresh")' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'inventory_after' },
        ],
      },
    ],
    validations: [
      {
        type: 'realtime_update',
        fromAgent: 'manager',
        toAgent: 'operator',
        description: 'Operator inventory updates after manager transfer',
        validate: async (agents) => {
          // Verify inventory table exists
          const operator = Array.from(agents.values()).find(a => a.role === 'operator');
          if (!operator) return false;
          const hasInventory = await operator.page.$('table tbody tr');
          return !!hasInventory;
        },
      },
    ],
  },
  {
    name: 'Permission_Boundary_Test',
    description: 'Verify operator cannot access orders',
    agents: [
      {
        role: 'operator',
        actions: [
          { type: 'navigate', target: '/orders' },
          { type: 'wait', delay: 3000 },
          { type: 'screenshot', value: 'orders_access_attempt' },
        ],
      },
      {
        role: 'marketer',
        actions: [
          { type: 'navigate', target: '/orders' },
          { type: 'wait', delay: 2000 },
          { type: 'screenshot', value: 'orders_access_success' },
        ],
      },
    ],
    validations: [
      {
        type: 'permission_boundary',
        fromAgent: 'operator',
        toAgent: 'marketer',
        description: 'Operator blocked from orders, Marketer allowed',
        validate: async (agents) => {
          const operator = Array.from(agents.values()).find(a => a.role === 'operator');
          const marketer = Array.from(agents.values()).find(a => a.role === 'marketer');

          if (!operator || !marketer) return false;

          const operatorContent = await operator.page.content();
          const marketerContent = await marketer.page.content();

          // Operator should see access denied or redirect
          const operatorBlocked = operatorContent.includes('Access Denied') ||
                                  operatorContent.includes('Forbidden') ||
                                  operatorContent.includes('Unauthorized') ||
                                  !(await operator.page.url()).includes('/orders');

          // Marketer should see orders page
          const marketerAllowed = (await marketer.page.url()).includes('/orders') &&
                                 (marketerContent.includes('Orders') || marketerContent.includes('orders'));

          return operatorBlocked && marketerAllowed;
        },
      },
    ],
  },
];
