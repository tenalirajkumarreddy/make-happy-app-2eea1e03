/**
 * Role Debug Test
 * Debug why agent is being redirected from transactions
 */

import { test, expect } from '@playwright/test';
import { MultiAgentTestFramework } from '../multi-agent-test-framework';

test.describe('Role Debug', () => {
  let framework: MultiAgentTestFramework;

  test.beforeAll(async () => {
    framework = new MultiAgentTestFramework();
    await framework.initialize();
  });

  test.afterAll(async () => {
    await framework.cleanup();
  });

  test('Debug agent role detection', async () => {
    const result = await framework.runScenario({
      name: 'Debug_Agent_Role',
      description: 'Debug agent role and permissions',
      agents: [
        {
          role: 'agent',
          actions: [
            { type: 'navigate', target: '/' },
            { type: 'wait', delay: 3000 },
            { type: 'screenshot', value: 'agent_dashboard' },
            // Try to access transactions
            { type: 'navigate', target: '/transactions' },
            { type: 'wait', delay: 3000 },
            { type: 'screenshot', value: 'agent_after_transactions_nav' },
          ],
        },
      ],
      validations: [
        {
          type: 'data_sync',
          fromAgent: 'agent',
          toAgent: 'agent',
          description: 'Agent role debug',
          validate: async (agents) => {
            const agent = Array.from(agents.values()).find(a => a.role === 'agent');
            if (!agent) return false;

            const url = await agent.page.url();
            const content = await agent.page.content();

            console.log('Agent Debug Info:');
            console.log(`  URL: ${url}`);
            console.log(`  On transactions: ${url.includes('/transactions')}`);
            console.log(`  On dashboard: ${url === 'http://localhost:5003/' || url.includes('/dashboard')}`);
            console.log(`  Has access denied: ${content.includes('Access Denied')}`);
            console.log(`  Has forbidden: ${content.includes('Forbidden')}`);

            return true;
          },
        },
      ],
    });

    expect(result.agentResults.size).toBe(1);
  });

  test('Compare all roles on transactions page', async () => {
    const roles = ['super_admin', 'manager', 'agent', 'marketer', 'operator'];
    const agents = roles.map(role => ({
      role,
      actions: [
        { type: 'navigate', target: '/transactions' },
        { type: 'wait', delay: 5000 },
        { type: 'screenshot', value: `${role}_transactions` },
      ],
    }));

    const result = await framework.runScenario({
      name: 'All_Roles_Transactions_Access',
      description: 'Check which roles can access transactions',
      agents: agents as any,
      validations: [
        {
          type: 'data_sync',
          fromAgent: 'super_admin',
          toAgent: 'operator',
          description: 'All roles transactions access',
          validate: async (agentsMap) => {
            console.log('\n========================================');
            console.log('TRANSACTIONS PAGE ACCESS BY ROLE');
            console.log('========================================');

            for (const agent of agentsMap.values()) {
              const url = await agent.page.url();
              const content = await agent.page.content();
              const onTransactions = url.includes('/transactions');
              const onDashboard = url === 'http://localhost:5003/' || url.includes('/dashboard');
              const accessDenied = content.includes('Access Denied') || content.includes('Forbidden');

              console.log(`${agent.role}:`);
              console.log(`  URL: ${url}`);
              console.log(`  On /transactions: ${onTransactions ? '✅ YES' : '❌ NO'}`);
              console.log(`  On dashboard: ${onDashboard ? '⚠️ Redirected' : ''}`);
              console.log(`  Access denied: ${accessDenied ? '❌ Blocked' : ''}`);
            }

            console.log('========================================\n');
            return true;
          },
        },
      ],
    });

    expect(result.agentResults.size).toBe(5);
  });
});
