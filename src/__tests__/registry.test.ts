/**
 * Agent Registry Test Suite
 * Comprehensive tests for Redis-based agent registry
 */

import { createClient } from 'redis';
import { RedisAgentRegistry } from '../src/registry/RedisAgentRegistry';
import { AgentRegistrationRequest, AgentQueryOptions } from '../src/types/registry';

describe('RedisAgentRegistry', () => {
  let registry: RedisAgentRegistry;
  let redisClient: any;

  beforeAll(async () => {
    // Use test Redis database
    redisClient = createClient({
      socket: { host: 'localhost', port: 6379 },
      database: 15 // Use separate DB for tests
    });
    await redisClient.connect();
    registry = new RedisAgentRegistry(redisClient);
  });

  afterAll(async () => {
    await registry.shutdown();
  });

  beforeEach(async () => {
    // Clear test database
    await redisClient.flushDb();
  });

  describe('Agent Registration', () => {
    const sampleAgent: AgentRegistrationRequest = {
      name: 'test-agent',
      version: '1.0.0',
      description: 'Test agent for unit tests',
      endpoint: 'http://localhost:8080',
      capabilities: [
        {
          name: 'data_analysis',
          type: 'analysis',
          description: 'Analyze data sets',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          estimatedLatency: 1000,
          reliability: 0.95
        }
      ],
      tags: ['test', 'analysis']
    };

    test('should register agent successfully', async () => {
      const agentId = await registry.register(sampleAgent);
      
      expect(agentId).toBeDefined();
      expect(typeof agentId).toBe('string');

      const retrievedAgent = await registry.getAgent(agentId);
      expect(retrievedAgent).toBeDefined();
      expect(retrievedAgent!.name).toBe(sampleAgent.name);
      expect(retrievedAgent!.capabilities).toHaveLength(1);
      expect(retrievedAgent!.status).toBe('healthy');
    });

    test('should handle duplicate agent names', async () => {
      const agentId1 = await registry.register(sampleAgent);
      const agentId2 = await registry.register(sampleAgent);
      
      expect(agentId1).not.toBe(agentId2);
      
      const agents = await registry.getAllAgents();
      expect(agents).toHaveLength(2);
    });

    test('should unregister agent successfully', async () => {
      const agentId = await registry.register(sampleAgent);
      const unregistered = await registry.unregister(agentId);
      
      expect(unregistered).toBe(true);
      
      const retrievedAgent = await registry.getAgent(agentId);
      expect(retrievedAgent).toBeNull();
    });

    test('should return false when unregistering non-existent agent', async () => {
      const result = await registry.unregister('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('Agent Discovery', () => {
    let agentIds: string[];

    beforeEach(async () => {
      const agents: AgentRegistrationRequest[] = [
        {
          name: 'data-agent',
          version: '1.0.0',
          description: 'Data processing agent',
          endpoint: 'http://localhost:8001',
          capabilities: [
            {
              name: 'data_processing',
              type: 'transformation',
              description: 'Process data',
              inputSchema: {},
              outputSchema: {},
              estimatedLatency: 500,
              reliability: 0.98
            }
          ],
          tags: ['data', 'processing']
        },
        {
          name: 'analysis-agent',
          version: '1.0.0',
          description: 'Data analysis agent',
          endpoint: 'http://localhost:8002',
          capabilities: [
            {
              name: 'data_analysis',
              type: 'analysis',
              description: 'Analyze data',
              inputSchema: {},
              outputSchema: {},
              estimatedLatency: 1500,
              reliability: 0.92
            }
          ],
          tags: ['data', 'analysis']
        }
      ];

      agentIds = await Promise.all(agents.map(agent => registry.register(agent)));
    });

    test('should find agents by capability', async () => {
      const agents = await registry.findAgents({ capability: 'data_processing' });
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('data-agent');
    });

    test('should find agents by tags', async () => {
      const agents = await registry.findAgents({ tags: ['data'] });
      
      expect(agents).toHaveLength(2);
    });

    test('should filter agents by reliability', async () => {
      const agents = await registry.findAgents({ minReliability: 0.95 });
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('data-agent');
    });

    test('should sort agents by performance', async () => {
      const agents = await registry.findAgents({ 
        tags: ['data'], 
        sortBy: 'reliability' 
      });
      
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('data-agent'); // Higher reliability
      expect(agents[1].name).toBe('analysis-agent');
    });

    test('should limit results', async () => {
      const agents = await registry.findAgents({ 
        tags: ['data'], 
        limit: 1 
      });
      
      expect(agents).toHaveLength(1);
    });
  });

  describe('Health Monitoring', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent: AgentRegistrationRequest = {
        name: 'health-test-agent',
        version: '1.0.0',
        description: 'Agent for health testing',
        endpoint: 'http://httpbin.org', // Use httpbin for testing
        capabilities: [{
          name: 'test_capability',
          type: 'action',
          description: 'Test capability',
          inputSchema: {},
          outputSchema: {}
        }],
        tags: ['test']
      };

      agentId = await registry.register(agent);
    });

    test('should perform health check on valid endpoint', async () => {
      // Update agent endpoint to valid httpbin health endpoint
      await registry.updateAgent(agentId, {
        endpoint: 'http://httpbin.org/status/200'
      });

      const healthResult = await registry.performHealthCheck(agentId);
      
      expect(healthResult.agentId).toBe(agentId);
      expect(['healthy', 'degraded']).toContain(healthResult.status);
      expect(healthResult.latency).toBeGreaterThan(0);
      expect(healthResult.timestamp).toBeInstanceOf(Date);
    });

    test('should detect unhealthy agent', async () => {
      // Update agent endpoint to invalid endpoint
      await registry.updateAgent(agentId, {
        endpoint: 'http://localhost:99999'
      });

      const healthResult = await registry.performHealthCheck(agentId);
      
      expect(healthResult.agentId).toBe(agentId);
      expect(healthResult.status).toBe('unhealthy');
      expect(healthResult.error).toBeDefined();
    });

    test('should perform health check on all agents', async () => {
      const healthResults = await registry.performHealthCheckAll();
      
      expect(healthResults).toHaveLength(1);
      expect(healthResults[0].agentId).toBe(agentId);
    });
  });

  describe('Performance Metrics', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent: AgentRegistrationRequest = {
        name: 'metrics-test-agent',
        version: '1.0.0',
        description: 'Agent for metrics testing',
        endpoint: 'http://localhost:8080',
        capabilities: [{
          name: 'test_capability',
          type: 'action',
          description: 'Test capability',
          inputSchema: {},
          outputSchema: {}
        }],
        tags: ['test']
      };

      agentId = await registry.register(agent);
    });

    test('should update performance metrics', async () => {
      const newMetrics = {
        successRate: 0.85,
        averageLatency: 1200,
        totalExecutions: 100,
        failureCount: 15
      };

      await registry.updatePerformanceMetrics(agentId, newMetrics);
      
      const agent = await registry.getAgent(agentId);
      expect(agent!.performance).toEqual(newMetrics);
    });

    test('should get ranked agents by performance', async () => {
      // Register another agent with different performance
      const secondAgent: AgentRegistrationRequest = {
        name: 'second-agent',
        version: '1.0.0',
        description: 'Second test agent',
        endpoint: 'http://localhost:8081',
        capabilities: [{
          name: 'test_capability',
          type: 'action',
          description: 'Test capability',
          inputSchema: {},
          outputSchema: {}
        }],
        tags: ['test']
      };

      const secondAgentId = await registry.register(secondAgent);

      // Update performance metrics
      await registry.updatePerformanceMetrics(agentId, {
        successRate: 0.95,
        averageLatency: 500
      });

      await registry.updatePerformanceMetrics(secondAgentId, {
        successRate: 0.80,
        averageLatency: 1000
      });

      const rankedAgents = await registry.getRankedAgents('test_capability', 'reliability');
      
      expect(rankedAgents).toHaveLength(2);
      expect(rankedAgents[0].performance.successRate).toBeGreaterThan(
        rankedAgents[1].performance.successRate
      );
    });
  });
});
