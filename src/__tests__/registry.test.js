/**
 * Agent Registry Test Suite (JavaScript)
 * Simple tests for Redis-based agent registry
 */

const { createClient } = require('redis');
const { RedisAgentRegistry } = require('../registry/RedisAgentRegistry');
const { logger } = require('../utils/logger');

/**
 * Simple test runner
 */
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  add_test(name, test_fn) {
    this.tests.push({ name, test_fn });
  }

  async run_all() {
    logger.info('Starting registry tests...');
    
    for (const test of this.tests) {
      try {
        await test.test_fn();
        this.passed++;
        logger.info(`✓ ${test.name}`);
      } catch (error) {
        this.failed++;
        logger.error(`✗ ${test.name}: ${error.message}`);
      }
    }
    
    logger.info(`Tests completed: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

/**
 * Registry test suite
 */
async function run_registry_tests() {
  const runner = new TestRunner();
  let registry = null;
  let redis_client = null;

  // Setup
  try {
    redis_client = createClient({
      socket: { host: 'localhost', port: 6379 },
      database: 15 // Use separate DB for tests
    });
    
    await redis_client.connect();
    registry = new RedisAgentRegistry(redis_client);
  } catch (error) {
    logger.error('Failed to setup test environment:', error.message);
    return false;
  }

  // Test: Basic agent registration
  runner.add_test('Basic agent registration', async () => {
    const agent_data = {
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'worker',
      capabilities: ['task-execution'],
      endpoint: 'http://localhost:8080',
      metadata: { version: '1.0.0' }
    };

    const result = await registry.register_agent(agent_data);
    if (!result.success) {
      throw new Error('Agent registration failed');
    }
  });

  // Test: Agent query
  runner.add_test('Agent query', async () => {
    // First register an agent
    const agent_data = {
      id: 'test-agent-2',
      name: 'Query Test Agent',
      type: 'worker',
      capabilities: ['data-processing'],
      endpoint: 'http://localhost:8081',
      metadata: { version: '1.0.0' }
    };

    await registry.register_agent(agent_data);

    // Then query for it
    const agents = await registry.find_agents_by_capability('data-processing');
    if (agents.length === 0) {
      throw new Error('No agents found with capability');
    }
  });

  // Test: Agent health check
  runner.add_test('Agent health check', async () => {
    const agent_data = {
      id: 'test-agent-3',
      name: 'Health Test Agent',
      type: 'worker',
      capabilities: ['health-check'],
      endpoint: 'http://localhost:8082',
      metadata: { version: '1.0.0' }
    };

    await registry.register_agent(agent_data);
    
    // Update health status
    const health_result = await registry.update_agent_health('test-agent-3', {
      status: 'healthy',
      last_heartbeat: new Date(),
      metrics: { cpu: 0.5, memory: 0.3 }
    });

    if (!health_result.success) {
      throw new Error('Health update failed');
    }
  });

  // Test: Agent deregistration
  runner.add_test('Agent deregistration', async () => {
    const agent_data = {
      id: 'test-agent-4',
      name: 'Deregister Test Agent',
      type: 'worker',
      capabilities: ['cleanup'],
      endpoint: 'http://localhost:8083',
      metadata: { version: '1.0.0' }
    };

    await registry.register_agent(agent_data);
    
    const deregister_result = await registry.deregister_agent('test-agent-4');
    if (!deregister_result.success) {
      throw new Error('Agent deregistration failed');
    }
  });

  // Run all tests
  const success = await runner.run_all();

  // Cleanup
  try {
    if (registry) {
      await registry.shutdown();
    }
    if (redis_client) {
      await redis_client.quit();
    }
  } catch (error) {
    logger.error('Cleanup failed:', error.message);
  }

  return success;
}

// Export for use in other test files
module.exports = {
  run_registry_tests,
  TestRunner
};

// Run tests if this file is executed directly
if (require.main === module) {
  run_registry_tests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logger.error('Test execution failed:', error);
      process.exit(1);
    });
}
