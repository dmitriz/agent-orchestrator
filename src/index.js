/**
 * Agent Orchestrator Main Application
 * Production-ready multi-agent orchestration system
 */

const { createClient } = require('redis');
const { logger } = require('./utils/logger');
const { RedisAgentRegistry } = require('./registry/RedisAgentRegistry');
const { EventDrivenOrchestrator } = require('./orchestration/EventDrivenOrchestrator');
const { APIServer } = require('./api/server');
const { get_app_config } = require('./config');

class AgentOrchestratorApp {
  constructor() {
    this.registry = null;
    this.orchestrator = null;
    this.api_server = null;
    this.redis_client = null;
    this.http_server = null;
    this.config = get_app_config();
  }

  /**
   * Start the orchestrator application
   */
  async start() {
    logger.info('Starting Agent Orchestrator', {
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      config: {
        pattern: this.config.orchestration.pattern,
        max_concurrent_tasks: this.config.orchestration.max_concurrent_tasks,
        redis_host: this.config.redis.host,
        kafka_brokers: this.config.kafka.brokers
      }
    });

    try {
      // Initialize Redis client
      this.redis_client = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port
        },
        password: this.config.redis.password,
        database: this.config.redis.db
      });

      this.redis_client.on('error', (error) => {
        logger.error('Redis client error', { error });
      });

      this.redis_client.on('connect', () => {
        logger.info('Connected to Redis', {
          host: this.config.redis.host,
          port: this.config.redis.port,
          db: this.config.redis.db
        });
      });

      await this.redis_client.connect();

      // Initialize Agent Registry
      this.registry = new RedisAgentRegistry(this.redis_client);
      logger.info('Agent Registry initialized');

      // Initialize Event-Driven Orchestrator
      this.orchestrator = new EventDrivenOrchestrator(
        { brokers: this.config.kafka.brokers },
        this.registry,
        {
          patterns: {
            enabled: ['orchestrator_worker', 'event_choreography'],
            default_pattern: this.config.orchestration.pattern
          },
          timeouts: {
            task_execution: this.config.orchestration.task_timeout,
            health_check: 30000,
            retry_delay: 5000
          },
          retry: {
            max_attempts: this.config.orchestration.max_retries,
            backoff_factor: 2,
            jitter: true
          },
          scaling: {
            auto_scale: true,
            max_concurrent_tasks: this.config.orchestration.max_concurrent_tasks,
            load_threshold: 0.8
          }
        }
      );

      await this.orchestrator.initialize();
      logger.info('Event-Driven Orchestrator started');

      // Initialize HTTP API Server
      this.api_server = new APIServer(this.registry, this.orchestrator);
      
      this.http_server = this.api_server.get_app().listen(
        this.config.server.port, 
        this.config.server.host, 
        () => {
          logger.info('HTTP API Server started', {
            host: this.config.server.host,
            port: this.config.server.port,
            endpoints: [
              'POST /api/v1/agents/register',
              'GET /api/v1/agents',
              'POST /api/v1/tasks',
              'GET /api/v1/status'
            ]
          });
        }
      );

      // Setup graceful shutdown
      this.setup_graceful_shutdown();

      logger.info('Agent Orchestrator started successfully');

    } catch (error) {
      logger.error('Failed to start Agent Orchestrator', { error });
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Shutdown the orchestrator application
   */
  async shutdown() {
    logger.info('Shutting down Agent Orchestrator');

    const shutdown_promises = [];

    // Shutdown HTTP server
    if (this.http_server) {
      shutdown_promises.push(
        new Promise((resolve) => {
          this.http_server.close(() => {
            logger.info('HTTP server closed');
            resolve();
          });
        })
      );
    }

    // Shutdown orchestrator
    if (this.orchestrator) {
      shutdown_promises.push(
        this.orchestrator.shutdown().then(() => {
          logger.info('Orchestrator stopped');
        })
      );
    }

    // Shutdown registry
    if (this.registry) {
      shutdown_promises.push(
        this.registry.cleanup().then(() => {
          logger.info('Registry shutdown');
        })
      );
    }

    // Close Redis connection
    if (this.redis_client) {
      shutdown_promises.push(
        this.redis_client.quit().then(() => {
          logger.info('Redis connection closed');
        })
      );
    }

    try {
      await Promise.all(shutdown_promises);
      logger.info('Agent Orchestrator shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  setup_graceful_shutdown() {
    const signals = ['SIGINT', 'SIGTERM'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        await this.shutdown();
        process.exit(0);
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      this.shutdown().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      this.shutdown().then(() => process.exit(1));
    });
  }

  /**
   * Get application status
   * @returns {Object} Application status
   */
  get_status() {
    return {
      orchestrator: this.orchestrator ? this.orchestrator.get_status() : null,
      registry_connected: this.redis_client ? this.redis_client.isReady : false,
      server_running: this.http_server ? this.http_server.listening : false,
      config: this.config
    };
  }
}

// Application entry point
if (require.main === module) {
  const app = new AgentOrchestratorApp();
  app.start().catch(error => {
    logger.error('Failed to start application', { error });
    process.exit(1);
  });
}

module.exports = { AgentOrchestratorApp };
