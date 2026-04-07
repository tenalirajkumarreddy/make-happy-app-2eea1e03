import { describe, it, expect } from 'vitest';
import { 
  addToQueue, 
  getQueuedActions, 
  removeFromQueue, 
  getQueueCount,
  PendingAction 
} from '@/lib/offlineQueue';

describe('Offline Queue', () => {
  it('should add and retrieve actions from queue', async () => {
    const testAction: PendingAction = {
      id: 'test-1',
      type: 'sale',
      payload: { amount: 100, customer_id: 'c1' },
      createdAt: new Date().toISOString(),
    };

    await addToQueue(testAction);
    const actions = await getQueuedActions();
    
    expect(actions).toContainEqual({
      ...testAction,
      retryCount: 0
    });
  });

  it('should remove action from queue', async () => {
    const testAction: PendingAction = {
      id: 'test-remove-1',
      type: 'transaction',
      payload: { amount: 50 },
      createdAt: new Date().toISOString(),
    };

    await addToQueue(testAction);
    await removeFromQueue(testAction.id);
    
    const actions = await getQueuedActions();
    expect(actions.find(a => a.id === testAction.id)).toBeUndefined();
  });

  it('should return correct queue count', async () => {
    const initialCount = await getQueueCount();
    
    const testAction: PendingAction = {
      id: `test-count-${Date.now()}`,
      type: 'visit',
      payload: { route_id: 'r1' },
      createdAt: new Date().toISOString(),
    };

    await addToQueue(testAction);
    const newCount = await getQueueCount();
    
    expect(newCount).toBeGreaterThan(initialCount);
    
    // Cleanup
    await removeFromQueue(testAction.id);
  });

  it('should handle multiple action types', async () => {
    const actions: PendingAction[] = [
      { id: 'multi-1', type: 'sale', payload: {}, createdAt: new Date().toISOString() },
      { id: 'multi-2', type: 'transaction', payload: {}, createdAt: new Date().toISOString() },
      { id: 'multi-3', type: 'visit', payload: {}, createdAt: new Date().toISOString() },
    ];

    for (const action of actions) {
      await addToQueue(action);
    }

    const queued = await getQueuedActions();
    
    expect(queued.some(a => a.id === 'multi-1')).toBe(true);
    expect(queued.some(a => a.id === 'multi-2')).toBe(true);
    expect(queued.some(a => a.id === 'multi-3')).toBe(true);

    // Cleanup
    for (const action of actions) {
      await removeFromQueue(action.id);
    }
  });
});
