/**
 * HTTP API Server
 * RESTful API for agent registration and orchestration management
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, addCorrelationId } from '../utils/logger';
import { IAgentRegistry } from '../types/registry';
import { EventDrivenOrchestrator } from '../orchestration/EventDrivenOrchestrator';
import { TaskRequest } from '../types/orchestration';

export class APIServer {
  private app: express.Application;
  private registry: IAgentRegistry;
  private orchestrator: EventDrivenOrchestrator;

  constructor(registry: IAgentRegistry, orchestrator: EventDrivenOrchestrator) {
    this.app = express();
    this.registry = registry;
    this.orchestrator = orchestrator;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging and correlation ID
    this.app.use((req, res, next) => {
      const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
      res.setHeader('x-correlation-id', correlationId);
      req.correlationId = correlationId;

      const correlatedLogger = addCorrelationId(correlationId);
      correlatedLogger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent']
      });

      next();
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: any) => {
      const correlatedLogger = addCorrelationId(req.correlationId || 'unknown');
      correlatedLogger.error('HTTP Error', {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url
      });

      res.status(500).json({
        error: 'Internal Server Error',
        correlationId: req.correlationId
      });
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // Agent Registry Routes
    this.app.post('/api/v1/agents/register', this.registerAgent.bind(this));
    this.app.delete('/api/v1/agents/:agentId', this.unregisterAgent.bind(this));
    this.app.get('/api/v1/agents', this.findAgents.bind(this));
    this.app.get('/api/v1/agents/:agentId', this.getAgent.bind(this));
    this.app.post('/api/v1/agents/:agentId/health', this.checkAgentHealth.bind(this));
    this.app.get('/api/v1/capabilities', this.getCapabilities.bind(this));

    // Task Orchestration Routes
    this.app.post('/api/v1/tasks', this.submitTask.bind(this));
    this.app.get('/api/v1/tasks/:taskId', this.getTaskStatus.bind(this));

    // System Status Routes
    this.app.get('/api/v1/status', this.getSystemStatus.bind(this));
  }

  private async registerAgent(req: Request, res: Response): Promise<void> {
    try {
      const correlatedLogger = addCorrelationId(req.correlationId!);
      
      const agentId = await this.registry.register(req.body);
      
      correlatedLogger.info('Agent registered via API', {
        agentId,
        agentName: req.body.name
      });

      res.status(201).json({
        agentId,
        message: 'Agent registered successfully'
      });

    } catch (error) {
      logger.error('Agent registration failed', { error });
      res.status(400).json({
        error: 'Agent registration failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async unregisterAgent(req: Request, res: Response): Promise<void> {
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

  private async findAgents(req: Request, res: Response): Promise<void> {
    try {
      const options = {
        capability: req.query.capability as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        minReliability: req.query.minReliability ? parseFloat(req.query.minReliability as string) : undefined,
        maxLatency: req.query.maxLatency ? parseInt(req.query.maxLatency as string, 10) : undefined,
        sortBy: req.query.sortBy as 'reliability' | 'latency' | 'cost' | 'performance',
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      };

      const agents = await this.registry.findAgents(options);
      res.json({ agents, count: agents.length });

    } catch (error) {
      logger.error('Agent search failed', { error });
      res.status(500).json({ error: 'Agent search failed' });
    }
  }

  private async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const agent = await this.registry.getAgent(agentId);
      
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

  private async checkAgentHealth(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const healthResult = await this.registry.performHealthCheck(agentId);
      res.json({ health: healthResult });

    } catch (error) {
      logger.error('Health check failed', { error });
      res.status(500).json({ error: 'Health check failed' });
    }
  }

  private async getCapabilities(req: Request, res: Response): Promise<void> {
    try {
      const capabilities = await this.registry.getCapabilities();
      res.json({ capabilities, count: capabilities.length });

    } catch (error) {
      logger.error('Capabilities retrieval failed', { error });
      res.status(500).json({ error: 'Capabilities retrieval failed' });
    }
  }

  private async submitTask(req: Request, res: Response): Promise<void> {
    try {
      const correlatedLogger = addCorrelationId(req.correlationId!);
      
      const taskRequest: Omit<TaskRequest, 'id'> = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          correlationId: req.correlationId!,
          retryCount: 0,
          maxRetries: req.body.metadata?.maxRetries || 3
        }
      };

      const taskId = await this.orchestrator.submitTask(taskRequest);
      
      correlatedLogger.info('Task submitted via API', {
        taskId,
        type: taskRequest.type,
        priority: taskRequest.priority
      });

      res.status(202).json({
        taskId,
        message: 'Task submitted for orchestration',
        correlationId: req.correlationId
      });

    } catch (error) {
      logger.error('Task submission failed', { error });
      res.status(400).json({
        error: 'Task submission failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      // TODO: Implement task status tracking
      res.json({
        taskId,
        status: 'not_implemented',
        message: 'Task status tracking not yet implemented'
      });

    } catch (error) {
      logger.error('Task status retrieval failed', { error });
      res.status(500).json({ error: 'Task status retrieval failed' });
    }
  }

  private async getSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      const agents = await this.registry.getAllAgents();
      const healthyAgents = agents.filter(a => a.status === 'healthy').length;
      
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        agents: {
          total: agents.length,
          healthy: healthyAgents,
          unhealthy: agents.length - healthyAgents
        },
        capabilities: (await this.registry.getCapabilities()).length,
        version: process.env.npm_package_version || '1.0.0'
      });

    } catch (error) {
      logger.error('System status retrieval failed', { error });
      res.status(500).json({ error: 'System status retrieval failed' });
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Extend Request interface for TypeScript
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}
