/**
 * Event-Driven Orchestration Engine (JavaScript Implementation)
 * Simplified orchestration without Kafka complexity
 */

const { v4: uuidv4 } = require('uuid');
const { logger, add_correlation_id } = require('../utils/logger');
const { validate_task_request, validate_agent_data } = require('../utils/validation');

class EventDrivenOrchestrator {
  constructor(kafka_config, registry, orchestration_config) {
    this.registry = registry;
    this.config = orchestration_config || this.get_default_config();
    this.is_running = false;
    
    // Simplified in-memory task tracking
    this.active_tasks = new Map();
    this.task_timeouts = new Map();
    this.task_results = new Map();
    this.task_queue = [];
    
    // Performance metrics
    this.metrics = {
      tasks_processed: 0,
      tasks_completed: 0,
      tasks_failed: 0,
      average_execution_time: 0
    };
  }

  /**
   * Get default orchestration configuration
   * @returns {Object} Default configuration
   */
  get_default_config() {
    return {
      patterns: {
        enabled: ['orchestrator_worker'],
        default_pattern: 'orchestrator_worker'
      },
      timeouts: {
        task_execution: 300000, // 5 minutes
        health_check: 30000,
        retry_delay: 5000
      },
      retry: {
        max_attempts: 3,
        backoff_factor: 2,
        jitter: true
      },
      scaling: {
        auto_scale: true,
        max_concurrent_tasks: 100,
        load_threshold: 0.8
      }
    };
  }

  /**
   * Initialize the orchestrator
   */
  async initialize() {
    try {
      logger.info('Initializing EventDrivenOrchestrator', {
        config: this.config,
        pattern: this.config.patterns.default_pattern
      });

      // Start health monitoring
      this.start_health_monitoring();
      
      this.is_running = true;
      logger.info('EventDrivenOrchestrator initialized successfully');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize EventDrivenOrchestrator', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit a task for execution
   * @param {Object} task_request - Task execution request
   * @returns {Promise<Object>} Task submission result
   */
  async submit_task(task_request) {
    const correlation_id = uuidv4();
    const context = add_correlation_id({ correlation_id });
    
    try {
      // Validate task request
      const validation_result = validate_task_request(task_request);
      if (!validation_result.valid) {
        throw new Error(`Invalid task request: ${validation_result.errors.join(', ')}`);
      }

      const task_id = uuidv4();
      const task = {
        id: task_id,
        correlation_id,
        ...task_request,
        status: 'submitted',
        submitted_at: new Date(),
        retry_count: 0
      };

      // Find suitable agent
      const suitable_agents = await this.find_suitable_agents(task_request.capabilities_required || []);
      if (suitable_agents.length === 0) {
        throw new Error('No suitable agents found for task');
      }

      // Select best agent (simple round-robin for now)
      const selected_agent = suitable_agents[0];
      task.assigned_agent = selected_agent.id;

      // Track the task
      this.active_tasks.set(task_id, task);
      this.metrics.tasks_processed++;

      // Set timeout
      this.set_task_timeout(task_id);

      // Execute task
      this.execute_task_async(task);

      logger.info('Task submitted successfully', { 
        task_id, 
        agent_id: selected_agent.id,
        ...context 
      });

      return {
        success: true,
        task_id,
        agent_id: selected_agent.id,
        status: 'submitted'
      };

    } catch (error) {
      logger.error('Failed to submit task', { error: error.message, ...context });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute task asynchronously
   * @param {Object} task - Task to execute
   */
  async execute_task_async(task) {
    const start_time = Date.now();
    
    try {
      task.status = 'executing';
      task.started_at = new Date();

      // Simulate task execution (in real implementation, this would call the agent)
      logger.info('Executing task', { 
        task_id: task.id, 
        agent_id: task.assigned_agent 
      });

      // For now, simulate successful execution after a delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mark as completed
      task.status = 'completed';
      task.completed_at = new Date();
      task.execution_time = Date.now() - start_time;

      // Store result
      this.task_results.set(task.id, {
        task_id: task.id,
        status: 'completed',
        result: { message: 'Task completed successfully' },
        execution_time: task.execution_time
      });

      // Update metrics
      this.metrics.tasks_completed++;
      this.update_average_execution_time(task.execution_time);

      // Clear timeout
      this.clear_task_timeout(task.id);

      logger.info('Task completed successfully', { 
        task_id: task.id,
        execution_time: task.execution_time
      });

    } catch (error) {
      await this.handle_task_failure(task, error);
    }
  }

  /**
   * Handle task failure with retry logic
   * @param {Object} task - Failed task
   * @param {Error} error - Error that caused failure
   */
  async handle_task_failure(task, error) {
    task.retry_count++;
    
    if (task.retry_count <= this.config.retry.max_attempts) {
      logger.warn('Task failed, retrying', { 
        task_id: task.id, 
        retry_count: task.retry_count,
        error: error.message 
      });

      // Calculate backoff delay
      const delay = this.calculate_backoff_delay(task.retry_count);
      
      setTimeout(() => {
        this.execute_task_async(task);
      }, delay);

    } else {
      task.status = 'failed';
      task.failed_at = new Date();
      task.error = error.message;

      this.task_results.set(task.id, {
        task_id: task.id,
        status: 'failed',
        error: error.message,
        retry_count: task.retry_count
      });

      this.metrics.tasks_failed++;
      this.clear_task_timeout(task.id);

      logger.error('Task failed permanently', { 
        task_id: task.id, 
        retry_count: task.retry_count,
        error: error.message 
      });
    }
  }

  /**
   * Get task status and result
   * @param {string} task_id - Task ID
   * @returns {Object} Task status and result
   */
  async get_task_status(task_id) {
    const active_task = this.active_tasks.get(task_id);
    const result = this.task_results.get(task_id);

    if (result) {
      return {
        success: true,
        task_id,
        status: result.status,
        result: result.result || null,
        error: result.error || null,
        execution_time: result.execution_time || null
      };
    }

    if (active_task) {
      return {
        success: true,
        task_id,
        status: active_task.status,
        submitted_at: active_task.submitted_at,
        started_at: active_task.started_at || null
      };
    }

    return {
      success: false,
      error: 'Task not found'
    };
  }

  /**
   * Find suitable agents for task requirements
   * @param {Array} required_capabilities - Required capabilities
   * @returns {Promise<Array>} Suitable agents
   */
  async find_suitable_agents(required_capabilities) {
    try {
      if (required_capabilities.length === 0) {
        // Return all healthy agents if no specific capabilities required
        return await this.registry.get_healthy_agents();
      }

      const suitable_agents = [];
      for (const capability of required_capabilities) {
        const agents = await this.registry.find_agents_by_capability(capability);
        suitable_agents.push(...agents);
      }

      // Remove duplicates and return only healthy agents
      const unique_agents = Array.from(
        new Map(suitable_agents.map(agent => [agent.id, agent])).values()
      );

      return unique_agents.filter(agent => agent.health?.status === 'healthy');
    } catch (error) {
      logger.error('Failed to find suitable agents', { error: error.message });
      return [];
    }
  }

  /**
   * Set task execution timeout
   * @param {string} task_id - Task ID
   */
  set_task_timeout(task_id) {
    const timeout_id = setTimeout(() => {
      this.handle_task_timeout(task_id);
    }, this.config.timeouts.task_execution);

    this.task_timeouts.set(task_id, timeout_id);
  }

  /**
   * Clear task timeout
   * @param {string} task_id - Task ID
   */
  clear_task_timeout(task_id) {
    const timeout_id = this.task_timeouts.get(task_id);
    if (timeout_id) {
      clearTimeout(timeout_id);
      this.task_timeouts.delete(task_id);
    }
  }

  /**
   * Handle task timeout
   * @param {string} task_id - Task ID
   */
  async handle_task_timeout(task_id) {
    const task = this.active_tasks.get(task_id);
    if (task && task.status === 'executing') {
      logger.warn('Task execution timed out', { task_id });
      await this.handle_task_failure(task, new Error('Task execution timed out'));
    }
  }

  /**
   * Calculate backoff delay for retries
   * @param {number} retry_count - Current retry count
   * @returns {number} Delay in milliseconds
   */
  calculate_backoff_delay(retry_count) {
    const base_delay = this.config.retry.base_delay || this.config.timeouts.retry_delay;
    let delay = base_delay * Math.pow(this.config.retry.backoff_factor, retry_count - 1);

    if (this.config.retry.jitter) {
      delay += Math.random() * 1000; // Add up to 1 second jitter
    }

    return Math.min(delay, 30000); // Cap at 30 seconds
  }

  /**
   * Update average execution time metric
   * @param {number} execution_time - Task execution time
   */
  update_average_execution_time(execution_time) {
    const total_completed = this.metrics.tasks_completed;
    const current_average = this.metrics.average_execution_time;
    
    this.metrics.average_execution_time = 
      ((current_average * (total_completed - 1)) + execution_time) / total_completed;
  }

  /**
   * Start health monitoring for agents
   */
  start_health_monitoring() {
    setInterval(async () => {
      try {
        await this.check_agent_health();
      } catch (error) {
        logger.error('Health monitoring failed', { error: error.message });
      }
    }, this.config.timeouts.health_check);
  }

  /**
   * Check health of all registered agents
   */
  async check_agent_health() {
    try {
      const all_agents = await this.registry.get_all_agents();
      for (const agent of all_agents) {
        // In a real implementation, this would ping the agent's health endpoint
        // For now, we'll assume agents are healthy if they were recently active
        const last_heartbeat = agent.health?.last_heartbeat;
        if (last_heartbeat) {
          const time_since_heartbeat = Date.now() - new Date(last_heartbeat).getTime();
          const is_healthy = time_since_heartbeat < this.config.timeouts.health_check * 2;
          
          await this.registry.update_agent_health(agent.id, {
            status: is_healthy ? 'healthy' : 'unhealthy',
            last_check: new Date(),
            response_time: Math.random() * 100 // Simulate response time
          });
        }
      }
    } catch (error) {
      logger.error('Agent health check failed', { error: error.message });
    }
  }

  /**
   * Get orchestrator metrics
   * @returns {Object} Current metrics
   */
  get_metrics() {
    return {
      ...this.metrics,
      active_tasks: this.active_tasks.size,
      queued_tasks: this.task_queue.length,
      uptime: this.is_running ? Date.now() - this.start_time : 0
    };
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown() {
    try {
      logger.info('Shutting down EventDrivenOrchestrator');
      
      this.is_running = false;
      
      // Clear all timeouts
      for (const timeout_id of this.task_timeouts.values()) {
        clearTimeout(timeout_id);
      }
      this.task_timeouts.clear();

      // Cancel active tasks
      for (const task of this.active_tasks.values()) {
        if (task.status === 'executing') {
          task.status = 'cancelled';
          task.cancelled_at = new Date();
        }
      }

      logger.info('EventDrivenOrchestrator shutdown complete');
      return { success: true };
    } catch (error) {
      logger.error('Failed to shutdown EventDrivenOrchestrator', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}

module.exports = { EventDrivenOrchestrator };