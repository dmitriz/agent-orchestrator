/**
 * Agent Orchestrator Main Application
 * Production-ready multi-agent orchestration system
 */

import { createClient } from 'redis';
import { logger } from './utils/logger';
import { config } from './config';
import { RedisAgentRegistry } from './registry/RedisAgentRegistry';
import { EventDrivenOrchestrator } from './orchestration/EventDrivenOrchestrator';
import { APIServer } from './api/server';

export class AgentOrchestratorApp {
  private registry?: RedisAgentRegistry;
  private orchestrator?: EventDrivenOrchestrator;
  private apiServer?: APIServer;
  private redisClient?: any;
  private httpServer?: any;

  async start(): Promise<void> {
    logger.info('Starting Agent Orchestrator', {
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      config: {
        pattern: config.orchestration.pattern,
        maxConcurrentTasks: config.orchestration.maxConcurrentTasks,
        redisHost: config.redis.host,
        kafkaBrokers: config.kafka.brokers
      }
    });

    try {
      // Initialize Redis client
      this.redisClient = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port
        },
        password: config.redis.password,
        database: config.redis.db
      });

      this.redisClient.on('error', (error: Error) => {
        logger.error('Redis client error', { error });
      });

      this.redisClient.on('connect', () => {
        logger.info('Connected to Redis', {
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db
        });
      });

      await this.redisClient.connect();

      // Initialize Agent Registry
      this.registry = new RedisAgentRegistry(this.redisClient);
      logger.info('Agent Registry initialized');

      // Initialize Event-Driven Orchestrator
      this.orchestrator = new EventDrivenOrchestrator(
        { brokers: config.kafka.brokers },
        this.registry,
        {
          pattern: config.orchestration.pattern as any,
          maxConcurrentTasks: config.orchestration.maxConcurrentTasks,
          taskTimeout: config.orchestration.taskTimeout,
          retryPolicy: config.orchestration.retryPolicy,
          circuitBreaker: config.orchestration.circuitBreaker
        }
      );

      await this.orchestrator.start();
      logger.info('Event-Driven Orchestrator started');

      // Initialize HTTP API Server
      this.apiServer = new APIServer(this.registry, this.orchestrator);
      
      this.httpServer = this.apiServer.getApp().listen(config.server.port, config.server.host, () => {
        logger.info('HTTP API Server started', {
          host: config.server.host,
          port: config.server.port,
          endpoints: [
            'POST /api/v1/agents/register',
            'GET /api/v1/agents',
            'POST /api/v1/tasks',
            'GET /api/v1/status'
          ]
        });
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Agent Orchestrator started successfully');

    } catch (error) {
      logger.error('Failed to start Agent Orchestrator', { error });
      await this.shutdown();
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Agent Orchestrator');

    const shutdownPromises: Promise<void>[] = [];

    // Shutdown HTTP server
    if (this.httpServer) {
      shutdownPromises.push(
        new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            logger.info('HTTP server closed');
            resolve();
          });
        })
      );
    }

    // Shutdown orchestrator
    if (this.orchestrator) {
      shutdownPromises.push(
        this.orchestrator.stop().then(() => {
          logger.info('Orchestrator stopped');
        })
      );
    }

    // Shutdown registry
    if (this.registry) {
      shutdownPromises.push(
        this.registry.shutdown().then(() => {
          logger.info('Registry shutdown');
        })
      );
    }

    // Close Redis connection
    if (this.redisClient) {
      shutdownPromises.push(
        this.redisClient.quit().then(() => {
          logger.info('Redis connection closed');
        })
      );
    }

    try {
      await Promise.all(shutdownPromises);
      logger.info('Agent Orchestrator shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }

  private setupGracefulShutdown(): void {
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
}

// Application entry point
if (require.main === module) {
  const app = new AgentOrchestratorApp();
  app.start().catch(error => {
    logger.error('Failed to start application', { error });
    process.exit(1);
  });
}

export default AgentOrchestratorApp;
