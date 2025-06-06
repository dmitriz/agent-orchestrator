/**
 * HTTP API Server
 * RESTful API for agent registration and orchestration management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger, add_correlation_id } = require('../utils/logger');

/**
 * @typedef {Object} APIServer
 * @description Server that handles API requests for agent orchestration
 */
class APIServer {
  /**
   * @param {Object} registry - Agent registry instance
   * @param {Object} orchestrator - Event driven orchestrator instance
   */
  constructor(registry, orchestrator) {
    this.app = express();
    this.registry = registry;
    this.orchestrator = orchestrator;
    this.setup_middleware();
    this.setup_routes();
  }

  setup_middleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging and correlation ID
    this.app.use((req, res, next) => {
      const correlation_id = req.headers['x-correlation-id'] || uuidv4();
      res.setHeader('x-correlation-id', correlation_id);
      req.correlation_id = correlation_id;

      const correlated_logger = add_correlation_id(correlation_id);
      correlated_logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent']
      });

      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      const correlated_logger = add_correlation_id(req.correlation_id || 'unknown');
      correlated_logger.error('HTTP Error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url
      });

      res.status(500).json({
        error: 'Internal Server Error',
        correlation_id: req.correlation_id
      });
    });
  }
  
  /**
   * Setup routes for the API server
   * @private
   */
  setup_routes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Agent Registry Routes
    this.app.post('/api/v1/agents/register', this.register_agent.bind(this));
    this.app.delete('/api/v1/agents/:agentId', this.unregister_agent.bind(this));
    this.app.get('/api/v1/agents', this.find_agents.bind(this));
    this.app.get('/api/v1/agents/:agentId', this.get_agent.bind(this));
    this.app.post('/api/v1/agents/:agentId/health', this.check_agent_health.bind(this));
    this.app.get('/api/v1/capabilities', this.get_capabilities.bind(this));

    // Task Orchestration Routes
    this.app.post('/api/v1/tasks', this.submit_task.bind(this));
    this.app.get('/api/v1/tasks/:taskId', this.get_task_status.bind(this));

    // System Status Routes
    this.app.get('/api/v1/status', this.get_system_status.bind(this));
  }

  /**
   * Register a new agent
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async register_agent(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      
      const agent_id = await this.registry.register(req.body);
      
      correlated_logger.info('Agent registered via API', {
        agent_id,
        agent_name: req.body.name
      });

      res.status(201).json({
        agent_id,
        message: 'Agent registered successfully'
      });

    } catch (error) {
      logger.error('Agent registration failed', { error });
      res.status(400).json({
        error: 'Agent registration failed',
        details: error.message
      });
    }
  }

  /**
   * Unregister an agent
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async unregister_agent(req, res) {
    try {
      const { agentId } = req.params;
      const success = await this.registry.unregister(agentId);
      
      if (success) {
        res.json({ message: 'Agent unregistered successfully' });
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }

    } catch (error) {
      logger.error('Agent unregistration failed', { error });
      res.status(500).json({ error: 'Agent unregistration failed' });
    }
  }

  /**
   * Find agents based on query options
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async find_agents(req, res) {
    try {
      const options = {
        capability: req.query.capability,
        tags: req.query.tags ? req.query.tags.split(',') : undefined,
        status: req.query.status ? req.query.status.split(',') : undefined,
        min_reliability: req.query.minReliability ? parseFloat(req.query.minReliability) : undefined,
        max_latency: req.query.maxLatency ? parseInt(req.query.maxLatency, 10) : undefined,
        sort_by: req.query.sortBy,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
      };

      const agents = await this.registry.find_agents(options);
      res.json({ agents, count: agents.length });

    } catch (error) {
      logger.error('Agent search failed', { error });
      res.status(500).json({ error: 'Agent search failed' });
    }
  }

  /**
   * Get a specific agent by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async get_agent(req, res) {
    try {
      const { agentId } = req.params;
      const agent = await this.registry.get_agent(agentId);
      
      if (agent) {
        res.json({ agent });
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }

    } catch (error) {
      logger.error('Agent retrieval failed', { error });
      res.status(500).json({ error: 'Agent retrieval failed' });
    }
  }

  /**
   * Check agent health
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async check_agent_health(req, res) {
    try {
      const { agentId } = req.params;
      const health_result = await this.registry.perform_health_check(agentId);
      res.json({ health: health_result });

    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(500).json({ error: 'Health check failed' });
    }
  }

  /**
   * Get all capabilities
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async get_capabilities(req, res) {
    try {
      const capabilities = await this.registry.get_capabilities();
      res.json({ capabilities, count: capabilities.length });

    } catch (error) {
      logger.error('Capabilities retrieval failed', { error });
      res.status(500).json({ error: 'Capabilities retrieval failed' });
    }
  }

  /**
   * Submit a task for orchestration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async submit_task(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      
      const task_request = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          correlation_id: req.correlation_id,
          retry_count: 0,
          max_retries: req.body.metadata?.max_retries || 3
        }
      };

      const task_id = await this.orchestrator.submit_task(task_request);
      
      correlated_logger.info('Task submitted via API', {
        task_id,
        type: task_request.type,
        priority: task_request.priority
      });

      res.status(202).json({
        task_id,
        message: 'Task submitted for orchestration',
        correlation_id: req.correlation_id
      });

    } catch (error) {
      logger.error('Task submission failed', { error });
      res.status(400).json({
        error: 'Task submission failed',
        details: error.message
      });
    }
  }

  /**
   * Get task status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async get_task_status(req, res) {
    try {
      const { taskId } = req.params;
      
      // TODO: Implement task status tracking
      res.json({
        task_id: taskId,
        status: 'not_implemented',
        message: 'Task status tracking not yet implemented'
      });

    } catch (error) {
      logger.error('Task status retrieval failed', { error });
      res.status(500).json({ error: 'Task status retrieval failed' });
    }
  }

  /**
   * Get system status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async get_system_status(req, res) {
    try {
      const agents = await this.registry.get_all_agents();
      const healthy_agents = agents.filter(a => a.status === 'healthy').length;
      
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        agents: {
          total: agents.length,
          healthy: healthy_agents,
          unhealthy: agents.length - healthy_agents
        },
        capabilities: (await this.registry.get_capabilities()).length,
        version: process.env.npm_package_version || '1.0.0'
      });

    } catch (error) {
      logger.error('System status retrieval failed', { error });
      res.status(500).json({ error: 'System status retrieval failed' });
    }
  }

  /**
   * Get Express app instance
   * @returns {Object} Express application
   */
  get_app() {
    return this.app;
  }
}

module.exports = { APIServer };