/**
 * HTTP API Server
 * RESTful API for agent registration and orchestration management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { logger, add_correlation_id } = require('../utils/logger');
const PRDParser = require('../prd/prd-parser');
const TaskGenerator = require('../prd/task-generator');
const { TaskValidator } = require('../validation/task-validator');

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
    
    // Initialize PRD processing components
    this.prd_parser = new PRDParser();
    this.task_generator = new TaskGenerator();
    this.task_validator = new TaskValidator();
    
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

    // PRD Processing Routes
    this.app.post('/api/v1/prd/parse', this.parse_prd.bind(this));
    this.app.post('/api/v1/prd/generate-tasks', this.generate_tasks_from_prd.bind(this));
    this.app.post('/api/v1/prd/validate', this.validate_prd_tasks.bind(this));
    this.app.post('/api/v1/prd/workflow', this.create_workflow_from_prd.bind(this));

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
   * Parse PRD markdown content into structured data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async parse_prd(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      const { prd_content, file_path } = req.body;

      if (!prd_content && !file_path) {
        return res.status(400).json({
          error: 'Either prd_content or file_path must be provided'
        });
      }

      let prd_data;
      if (file_path) {
        prd_data = this.prd_parser.parse_prd_file(file_path);
      } else {
        prd_data = this.prd_parser.parse_prd_content(prd_content);
      }

      // Validate PRD data
      const validation_result = this.task_validator.validate_prd_data(prd_data);

      correlated_logger.info('PRD parsed successfully', {
        project_name: prd_data.project_name,
        complexity_level: prd_data.complexity_assessment?.level,
        validation_status: validation_result.is_valid
      });

      res.json({
        prd_data,
        validation: validation_result,
        parsed_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('PRD parsing failed', { error });
      res.status(400).json({
        error: 'PRD parsing failed',
        details: error.message
      });
    }
  }

  /**
   * Generate task breakdown from PRD data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async generate_tasks_from_prd(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      const { prd_data } = req.body;

      if (!prd_data) {
        return res.status(400).json({
          error: 'prd_data is required'
        });
      }

      // Generate task breakdown
      const task_breakdown = this.task_generator.generate_task_breakdown(prd_data);

      correlated_logger.info('Tasks generated from PRD', {
        project_name: task_breakdown.project_name,
        total_tasks: task_breakdown.total_tasks,
        estimated_hours: task_breakdown.estimated_total_hours
      });

      res.json({
        task_breakdown,
        generated_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Task generation failed', { error });
      res.status(400).json({
        error: 'Task generation failed',
        details: error.message
      });
    }
  }

  /**
   * Validate task breakdown configuration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async validate_prd_tasks(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      const { task_breakdown } = req.body;

      if (!task_breakdown) {
        return res.status(400).json({
          error: 'task_breakdown is required'
        });
      }

      // Validate task breakdown
      const validation_result = this.task_validator.validate_task_breakdown(task_breakdown);

      correlated_logger.info('Task breakdown validated', {
        project_name: task_breakdown.project_name,
        validation_status: validation_result.is_valid,
        total_issues: validation_result.issues.length,
        total_warnings: validation_result.warnings.length
      });

      res.json({
        validation_result,
        validated_at: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Task validation failed', { error });
      res.status(400).json({
        error: 'Task validation failed',
        details: error.message
      });
    }
  }

  /**
   * Create complete workflow from PRD (parse + generate + validate)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async create_workflow_from_prd(req, res) {
    try {
      const correlated_logger = add_correlation_id(req.correlation_id);
      const { prd_content, file_path, auto_assign = false } = req.body;

      if (!prd_content && !file_path) {
        return res.status(400).json({
          error: 'Either prd_content or file_path must be provided'
        });
      }

      // Step 1: Parse PRD
      let prd_data;
      if (file_path) {
        prd_data = this.prd_parser.parse_prd_file(file_path);
      } else {
        prd_data = this.prd_parser.parse_prd_content(prd_content);
      }

      // Step 2: Validate PRD
      const prd_validation = this.task_validator.validate_prd_data(prd_data);
      if (!prd_validation.is_valid) {
        return res.status(400).json({
          error: 'PRD validation failed',
          validation_issues: prd_validation.issues
        });
      }

      // Step 3: Generate tasks
      const task_breakdown = this.task_generator.generate_task_breakdown(prd_data);

      // Step 4: Validate task breakdown
      const task_validation = this.task_validator.validate_task_breakdown(task_breakdown);

      // Step 5: Optionally assign tasks to agents
      let agent_assignments = null;
      if (auto_assign) {
        agent_assignments = await this.assign_tasks_to_agents(task_breakdown.tasks);
      }

      const workflow_result = {
        workflow_id: uuidv4(),
        prd_data,
        task_breakdown,
        validation: {
          prd: prd_validation,
          tasks: task_validation
        },
        agent_assignments,
        created_at: new Date().toISOString(),
        status: 'ready'
      };

      correlated_logger.info('Complete workflow created from PRD', {
        workflow_id: workflow_result.workflow_id,
        project_name: prd_data.project_name,
        total_tasks: task_breakdown.total_tasks,
        validation_status: task_validation.is_valid,
        auto_assigned: auto_assign
      });

      res.json(workflow_result);

    } catch (error) {
      logger.error('Workflow creation failed', { error });
      res.status(400).json({
        error: 'Workflow creation failed',
        details: error.message
      });
    }
  }

  /**
   * Assign tasks to available agents based on capabilities
   * @param {Array} tasks - Array of task configurations
   * @returns {Array} Agent assignments
   * @private
   */
  async assign_tasks_to_agents(tasks) {
    try {
      const available_agents = await this.registry.get_all_agents();
      const assignments = [];

      for (const task of tasks) {
        // Find agents with matching capabilities
        const suitable_agents = available_agents.filter(agent => 
          agent.status === 'healthy' && 
          this.agent_can_handle_task(agent, task)
        );

        if (suitable_agents.length > 0) {
          // For now, assign to the first suitable agent
          // In the future, this could use load balancing or specialty matching
          assignments.push({
            task_id: task.id,
            agent_id: suitable_agents[0].agent_id,
            assigned_at: new Date().toISOString(),
            status: 'pending'
          });
        } else {
          assignments.push({
            task_id: task.id,
            agent_id: null,
            assigned_at: new Date().toISOString(),
            status: 'unassigned',
            reason: 'No suitable agents available'
          });
        }
      }

      return assignments;
    } catch (error) {
      logger.error('Task assignment failed', { error });
      return [];
    }
  }

  /**
   * Check if an agent can handle a specific task
   * @param {Object} agent - Agent configuration
   * @param {Object} task - Task configuration
   * @returns {boolean} True if agent can handle the task
   * @private
   */
  agent_can_handle_task(agent, task) {
    // Basic capability matching - can be enhanced with more sophisticated logic
    if (!task.ai_executable) {
      return false; // Only AI-executable tasks can be assigned to agents
    }

    // Check if agent has required capabilities for this task complexity
    const required_capabilities = this.get_required_capabilities_for_task(task);
    
    return required_capabilities.every(capability => 
      agent.capabilities && agent.capabilities.includes(capability)
    );
  }

  /**
   * Get required capabilities for a task based on its properties
   * @param {Object} task - Task configuration
   * @returns {Array} Array of required capability strings
   * @private
   */
  get_required_capabilities_for_task(task) {
    const capabilities = ['task_execution'];
    
    // Add complexity-based capabilities
    if (task.complexity === 'advanced' || task.complexity === 'expert') {
      capabilities.push('advanced_processing');
    }
    
    // Add task-type specific capabilities based on title/description keywords
    const task_text = `${task.title} ${task.description}`.toLowerCase();
    
    if (task_text.includes('api') || task_text.includes('endpoint')) {
      capabilities.push('api_development');
    }
    
    if (task_text.includes('database') || task_text.includes('storage')) {
      capabilities.push('database_operations');
    }
    
    if (task_text.includes('test') || task_text.includes('validation')) {
      capabilities.push('testing');
    }

    return capabilities;
  }
}

module.exports = { APIServer };