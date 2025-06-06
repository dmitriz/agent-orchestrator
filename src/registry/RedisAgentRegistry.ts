/**
 * Production Agent Registry Implementation
 * Following CSIRO Tool/Agent Registry Pattern with Redis backing store
 */

import { Redis } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { logger } from '../utils/logger';
import {
  IAgentRegistry,
  AgentMetadata,
  AgentRegistrationRequest,
  AgentQueryOptions,
  HealthCheckResult,
  AgentCapability
} from '../types/registry';

export class RedisAgentRegistry implements IAgentRegistry {
  private redis: Redis;
  private readonly AGENT_KEY_PREFIX = 'agent:';
  private readonly CAPABILITIES_SET_KEY = 'capabilities';
  private readonly TAGS_SET_KEY = 'tags';
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
    this.startHealthCheckScheduler();
  }

  async register(request: AgentRegistrationRequest): Promise<string> {
    const agentId = uuidv4();
    const now = new Date();
    
    const agentMetadata: AgentMetadata = {
      id: agentId,
      name: request.name,
      version: request.version,
      description: request.description,
      endpoint: request.endpoint,
      capabilities: request.capabilities,
      status: 'healthy',
      tags: request.tags || [],
      lastHeartbeat: now,
      registeredAt: now,
      performance: {
        successRate: 1.0,
        averageLatency: 0,
        totalExecutions: 0,
        failureCount: 0
      },
      constraints: {
        maxConcurrentTasks: request.constraints?.maxConcurrentTasks || 10,
        rateLimitPerMinute: request.constraints?.rateLimitPerMinute || 60,
        requiredResources: request.constraints?.requiredResources || []
      }
    };

    // Store agent metadata
    await this.redis.hSet(
      `${this.AGENT_KEY_PREFIX}${agentId}`,
      'metadata',
      JSON.stringify(agentMetadata)
    );

    // Index capabilities and tags for fast searching
    for (const capability of request.capabilities) {
      await this.redis.sAdd(`${this.CAPABILITIES_SET_KEY}:${capability.name}`, agentId);
    }

    for (const tag of request.tags || []) {
      await this.redis.sAdd(`${this.TAGS_SET_KEY}:${tag}`, agentId);
    }

    // Add to agent list
    await this.redis.sAdd('agents', agentId);

    logger.info(`Agent registered successfully`, {
      agentId,
      name: request.name,
      capabilities: request.capabilities.map(c => c.name)
    });

    return agentId;
  }

  async unregister(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return false;
    }

    // Remove capability indexes
    for (const capability of agent.capabilities) {
      await this.redis.sRem(`${this.CAPABILITIES_SET_KEY}:${capability.name}`, agentId);
    }

    // Remove tag indexes
    for (const tag of agent.tags) {
      await this.redis.sRem(`${this.TAGS_SET_KEY}:${tag}`, agentId);
    }

    // Remove agent data
    await this.redis.del(`${this.AGENT_KEY_PREFIX}${agentId}`);
    await this.redis.sRem('agents', agentId);

    logger.info(`Agent unregistered successfully`, { agentId });
    return true;
  }

  async updateAgent(agentId: string, updates: Partial<AgentMetadata>): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return false;
    }

    const updatedAgent = { ...agent, ...updates };
    updatedAgent.lastHeartbeat = new Date();

    await this.redis.hSet(
      `${this.AGENT_KEY_PREFIX}${agentId}`,
      'metadata',
      JSON.stringify(updatedAgent)
    );

    return true;
  }

  async findAgents(options: AgentQueryOptions): Promise<AgentMetadata[]> {
    let candidateIds: string[] = [];

    if (options.capability) {
      candidateIds = await this.redis.sMembers(`${this.CAPABILITIES_SET_KEY}:${options.capability}`);
    } else if (options.tags && options.tags.length > 0) {
      // Intersection of agents with all specified tags
      const keys = options.tags.map(tag => `${this.TAGS_SET_KEY}:${tag}`);
      candidateIds = await this.redis.sInter(keys);
    } else {
      candidateIds = await this.redis.sMembers('agents');
    }

    const agents: AgentMetadata[] = [];
    
    for (const agentId of candidateIds) {
      const agent = await this.getAgent(agentId);
      if (agent && this.matchesFilters(agent, options)) {
        agents.push(agent);
      }
    }

    // Apply sorting
    if (options.sortBy) {
      agents.sort((a, b) => this.compareAgents(a, b, options.sortBy!));
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      return agents.slice(0, options.limit);
    }

    return agents;
  }

  async getAgent(agentId: string): Promise<AgentMetadata | null> {
    try {
      const metadataStr = await this.redis.hGet(`${this.AGENT_KEY_PREFIX}${agentId}`, 'metadata');
      if (!metadataStr) {
        return null;
      }
      return JSON.parse(metadataStr) as AgentMetadata;
    } catch (error) {
      logger.error(`Error retrieving agent ${agentId}`, { error });
      return null;
    }
  }

  async getAllAgents(): Promise<AgentMetadata[]> {
    const agentIds = await this.redis.sMembers('agents');
    const agents: AgentMetadata[] = [];

    for (const agentId of agentIds) {
      const agent = await this.getAgent(agentId);
      if (agent) {
        agents.push(agent);
      }
    }

    return agents;
  }

  async getCapabilities(): Promise<AgentCapability[]> {
    const agents = await this.getAllAgents();
    const capabilityMap = new Map<string, AgentCapability>();

    for (const agent of agents) {
      for (const capability of agent.capabilities) {
        capabilityMap.set(capability.name, capability);
      }
    }

    return Array.from(capabilityMap.values());
  }

  async performHealthCheck(agentId: string): Promise<HealthCheckResult> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return {
        agentId,
        status: 'offline',
        latency: 0,
        error: 'Agent not found',
        timestamp: new Date()
      };
    }

    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${agent.endpoint}/health`, {
        timeout: 5000,
        headers: { 'User-Agent': 'Agent-Orchestrator-Health-Check/1.0' }
      });

      const latency = Date.now() - startTime;
      const status = response.status === 200 ? 'healthy' : 'degraded';

      // Update agent status
      await this.updateAgent(agentId, { status, lastHeartbeat: new Date() });

      return {
        agentId,
        status,
        latency,
        timestamp: new Date()
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      const status = 'unhealthy';

      // Update agent status
      await this.updateAgent(agentId, { status, lastHeartbeat: new Date() });

      return {
        agentId,
        status,
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  async performHealthCheckAll(): Promise<HealthCheckResult[]> {
    const agents = await this.getAllAgents();
    const healthChecks = agents.map(agent => this.performHealthCheck(agent.id));
    return Promise.all(healthChecks);
  }

  async updatePerformanceMetrics(
    agentId: string, 
    metrics: Partial<AgentMetadata['performance']>
  ): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return;
    }

    const updatedPerformance = { ...agent.performance, ...metrics };
    await this.updateAgent(agentId, { performance: updatedPerformance });
  }

  async searchByCapability(capabilityName: string): Promise<AgentMetadata[]> {
    return this.findAgents({ capability: capabilityName });
  }

  async getRankedAgents(
    capability: string, 
    criteria: 'cost' | 'performance' | 'reliability'
  ): Promise<AgentMetadata[]> {
    const sortBy = criteria === 'performance' ? 'performance' : criteria;
    return this.findAgents({ capability, sortBy });
  }

  // Private helper methods

  private matchesFilters(agent: AgentMetadata, options: AgentQueryOptions): boolean {
    if (options.status && !options.status.includes(agent.status)) {
      return false;
    }

    if (options.minReliability && agent.performance.successRate < options.minReliability) {
      return false;
    }

    if (options.maxLatency && agent.performance.averageLatency > options.maxLatency) {
      return false;
    }

    return true;
  }

  private compareAgents(a: AgentMetadata, b: AgentMetadata, sortBy: string): number {
    switch (sortBy) {
      case 'reliability':
        return b.performance.successRate - a.performance.successRate;
      case 'latency':
        return a.performance.averageLatency - b.performance.averageLatency;
      case 'performance':
        // Composite score: reliability * (1 / (latency + 1))
        const scoreA = a.performance.successRate / (a.performance.averageLatency + 1);
        const scoreB = b.performance.successRate / (b.performance.averageLatency + 1);
        return scoreB - scoreA;
      default:
        return 0;
    }
  }

  private startHealthCheckScheduler(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        logger.debug('Running scheduled health checks');
        await this.performHealthCheckAll();
      } catch (error) {
        logger.error('Error in scheduled health check', { error });
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    await this.redis.quit();
  }
}
