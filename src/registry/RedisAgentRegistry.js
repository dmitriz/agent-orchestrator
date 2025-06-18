/**
 * Production Agent Registry Implementation
 * Following CSIRO Tool/Agent Registry Pattern with Redis backing store
 */

const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { validate_agent_registration, validate_query_options, create_agent_metadata } = require('../utils/validation');

class RedisAgentRegistry {
  constructor(redis_client) {
    this.redis = redis_client;
    this.AGENT_KEY_PREFIX = 'agent:';
    this.CAPABILITIES_SET_KEY = 'capabilities';
    this.TAGS_SET_KEY = 'tags';
    this.HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
    this.health_check_timer = null;
    this.start_health_check_scheduler();
  }

  /**
   * Register a new agent
   * @param {Object} request - Agent registration request
   * @returns {Promise<string>} Agent ID
   */
  async register(request) {
    if (!validate_agent_registration(request)) {
      throw new Error('Invalid agent registration request');
    }

    const agent_id = uuidv4();
    const agent_metadata = create_agent_metadata(request, agent_id);
    
    try {
      // Store agent metadata
      const agent_key = this.AGENT_KEY_PREFIX + agent_id;
      await this.redis.setEx(agent_key, 86400, JSON.stringify(agent_metadata)); // 24 hours TTL
      
      // Add to capability sets for discovery
      for (const capability of agent_metadata.capabilities) {
        await this.redis.sAdd(`capability:${capability.name}`, agent_id);
        await this.redis.sAdd(this.CAPABILITIES_SET_KEY, capability.name);
      }
      
      // Add to tag sets for discovery
      for (const tag of agent_metadata.tags) {
        await this.redis.sAdd(`tag:${tag}`, agent_id);
        await this.redis.sAdd(this.TAGS_SET_KEY, tag);
      }
      
      logger.info('Agent registered successfully', {
        agent_id,
        agent_name: agent_metadata.name,
        capabilities: agent_metadata.capabilities.map(c => c.name)
      });
      
      return agent_id;
    } catch (error) {
      logger.error('Failed to register agent', { error, agent_id });
      throw new Error('Agent registration failed');
    }
  }

  /**
   * Unregister an agent
   * @param {string} agent_id - Agent ID to unregister
   * @returns {Promise<boolean>} Success status
   */
  async unregister(agent_id) {
    try {
      const agent = await this.get_agent(agent_id);
      if (!agent) {
        return false;
      }

      // Remove from Redis
      const agent_key = this.AGENT_KEY_PREFIX + agent_id;
      await this.redis.del(agent_key);
      
      // Remove from capability sets
      for (const capability of agent.capabilities) {
        await this.redis.sRem(`capability:${capability.name}`, agent_id);
      }
      
      // Remove from tag sets
      for (const tag of agent.tags) {
        await this.redis.sRem(`tag:${tag}`, agent_id);
      }
      
      logger.info('Agent unregistered successfully', { agent_id });
      return true;
    } catch (error) {
      logger.error('Failed to unregister agent', { error, agent_id });
      return false;
    }
  }

  /**
   * Find agents based on query options
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of agent metadata
   */
  async find_agents(options = {}) {
    if (!validate_query_options(options)) {
      throw new Error('Invalid query options');
    }

    try {
      let agent_ids = new Set();
      
      // If capability filter is specified
      if (options.capability) {
        const capability_agents = await this.redis.sMembers(`capability:${options.capability}`);
        agent_ids = new Set(capability_agents);
      }
      
      // If tag filters are specified
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          const tag_agents = await this.redis.sMembers(`tag:${tag}`);
          if (agent_ids.size === 0) {
            agent_ids = new Set(tag_agents);
          } else {
            // Intersection
            agent_ids = new Set([...agent_ids].filter(id => tag_agents.includes(id)));
          }
        }
      }
      
      // If no specific filters, get all agents
      if (agent_ids.size === 0) {
        const keys = await this.redis.keys(this.AGENT_KEY_PREFIX + '*');
        agent_ids = new Set(keys.map(key => key.replace(this.AGENT_KEY_PREFIX, '')));
      }
      
      // Retrieve agent metadata
      const agents = [];
      for (const agent_id of agent_ids) {
        const agent = await this.get_agent(agent_id);
        if (agent) {
          agents.push(agent);
        }
      }
      
      // Apply filters
      let filtered_agents = agents.filter(agent => {
        if (options.status && !options.status.includes(agent.status)) {
          return false;
        }
        if (options.min_reliability && agent.performance.success_rate < options.min_reliability) {
          return false;
        }
        if (options.max_latency && agent.performance.average_latency > options.max_latency) {
          return false;
        }
        return true;
      });
      
      // Sort if specified
      if (options.sort_by) {
        filtered_agents = this.sort_agents(filtered_agents, options.sort_by);
      }
      
      // Apply limit
      if (options.limit) {
        filtered_agents = filtered_agents.slice(0, options.limit);
      }
      
      return filtered_agents;
    } catch (error) {
      logger.error('Failed to find agents', { error, options });
      throw new Error('Agent search failed');
    }
  }

  /**
   * Get a specific agent by ID
   * @param {string} agent_id - Agent ID
   * @returns {Promise<Object|null>} Agent metadata or null
   */
  async get_agent(agent_id) {
    try {
      const agent_key = this.AGENT_KEY_PREFIX + agent_id;
      const agent_data = await this.redis.get(agent_key);
      
      if (!agent_data) {
        return null;
      }
      
      const agent = JSON.parse(agent_data);
      // Convert date strings back to Date objects
      agent.last_heartbeat = new Date(agent.last_heartbeat);
      agent.registered_at = new Date(agent.registered_at);
      
      return agent;
    } catch (error) {
      logger.error('Failed to get agent', { error, agent_id });
      return null;
    }
  }

  /**
   * Get all agents
   * @returns {Promise<Array>} Array of all agent metadata
   */
  async get_all_agents() {
    try {
      const keys = await this.redis.keys(this.AGENT_KEY_PREFIX + '*');
      const agents = [];
      
      for (const key of keys) {
        const agent_id = key.replace(this.AGENT_KEY_PREFIX, '');
        const agent = await this.get_agent(agent_id);
        if (agent) {
          agents.push(agent);
        }
      }
      
      return agents;
    } catch (error) {
      logger.error('Failed to get all agents', { error });
      return [];
    }
  }

  /**
   * Get all capabilities
   * @returns {Promise<Array>} Array of capability names
   */
  async get_capabilities() {
    try {
      const capabilities = await this.redis.sMembers(this.CAPABILITIES_SET_KEY);
      return capabilities.sort();
    } catch (error) {
      logger.error('Failed to get capabilities', { error });
      return [];
    }
  }

  /**
   * Perform health check on a specific agent
   * @param {string} agent_id - Agent ID
   * @returns {Promise<Object>} Health check result
   */
  async perform_health_check(agent_id) {
    const agent = await this.get_agent(agent_id);
    if (!agent) {
      return {
        agent_id,
        status: 'offline',
        latency: -1,
        error: 'Agent not found',
        timestamp: new Date()
      };
    }

    try {
      const start_time = Date.now();
      const response = await axios.get(`${agent.endpoint}/health`, { timeout: 5000 });
      const latency = Date.now() - start_time;
      
      const status = response.status === 200 ? 'healthy' : 'degraded';
      
      // Update agent status and heartbeat
      agent.status = status;
      agent.last_heartbeat = new Date();
      await this.update_agent(agent_id, { status, last_heartbeat: agent.last_heartbeat });
      
      return {
        agent_id,
        status,
        latency,
        timestamp: new Date()
      };
    } catch (error) {
      // Update agent status to unhealthy
      await this.update_agent(agent_id, { status: 'unhealthy' });
      
      return {
        agent_id,
        status: 'unhealthy',
        latency: -1,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Perform health check on all agents
   * @returns {Promise<Array>} Array of health check results
   */
  async perform_health_check_all() {
    const agents = await this.get_all_agents();
    const health_checks = [];
    
    for (const agent of agents) {
      const health_result = await this.perform_health_check(agent.id);
      health_checks.push(health_result);
    }
    
    return health_checks;
  }

  /**
   * Update agent metadata
   * @param {string} agent_id - Agent ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} Success status
   */
  async update_agent(agent_id, updates) {
    try {
      const agent = await this.get_agent(agent_id);
      if (!agent) {
        return false;
      }
      
      const updated_agent = { ...agent, ...updates };
      const agent_key = this.AGENT_KEY_PREFIX + agent_id;
      await this.redis.setEx(agent_key, 86400, JSON.stringify(updated_agent));
      
      return true;
    } catch (error) {
      logger.error('Failed to update agent', { error, agent_id });
      return false;
    }
  }

  /**
   * Update performance metrics for an agent
   * @param {string} agent_id - Agent ID
   * @param {Object} metrics - Performance metrics to update
   */
  async update_performance_metrics(agent_id, metrics) {
    const agent = await this.get_agent(agent_id);
    if (agent) {
      agent.performance = { ...agent.performance, ...metrics };
      await this.update_agent(agent_id, { performance: agent.performance });
    }
  }

  /**
   * Sort agents by specified criteria
   * @param {Array} agents - Array of agents to sort
   * @param {string} sort_by - Sort criteria
   * @returns {Array} Sorted agents
   * @private
   */
  sort_agents(agents, sort_by) {
    return agents.sort((a, b) => {
      switch (sort_by) {
        case 'reliability':
          return b.performance.success_rate - a.performance.success_rate;
        case 'latency':
          return a.performance.average_latency - b.performance.average_latency;
        case 'performance':
          return b.performance.total_executions - a.performance.total_executions;
        default:
          return 0;
      }
    });
  }

  /**
   * Start health check scheduler
   * @private
   */
  start_health_check_scheduler() {
    this.health_check_timer = setInterval(async () => {
      try {
        await this.perform_health_check_all();
      } catch (error) {
        logger.error('Health check scheduler error', { error });
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health check scheduler
   */
  stop_health_check_scheduler() {
    if (this.health_check_timer) {
      clearInterval(this.health_check_timer);
      this.health_check_timer = null;
    }
  }

  /**
   * Cleanup and close connections
   */
  async cleanup() {
    this.stop_health_check_scheduler();
    await this.redis.quit();
  }
}

module.exports = { RedisAgentRegistry };
