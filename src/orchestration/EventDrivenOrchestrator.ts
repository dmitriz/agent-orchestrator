/**
 * Event-Driven Orchestration Engine
 * Implements Confluent's Event-Driven Multi-Agent Systems patterns
 */

import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { logger, addCorrelationId } from '../utils/logger';
import { IAgentRegistry } from '../types/registry';
import {
  AgentEvent,
  TaskRequest,
  TaskAssignment,
  TaskResult,
  OrchestrationPattern,
  OrchestrationConfig
} from '../types/orchestration';

export class EventDrivenOrchestrator {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private registry: IAgentRegistry;
  private config: OrchestrationConfig;
  private isRunning = false;

  // Topic names following event-driven patterns
  private readonly TASK_REQUESTS_TOPIC = 'agent.task.requests';
  private readonly TASK_ASSIGNMENTS_TOPIC = 'agent.task.assignments';
  private readonly TASK_RESULTS_TOPIC = 'agent.task.results';
  private readonly AGENT_EVENTS_TOPIC = 'agent.events';
  private readonly WORKFLOW_EVENTS_TOPIC = 'workflow.events';

  // Active task tracking for orchestrator-worker pattern
  private activeTasks = new Map<string, TaskAssignment>();
  private taskTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    kafkaConfig: { brokers: string[] },
    registry: IAgentRegistry,
    orchestrationConfig: OrchestrationConfig
  ) {
    this.kafka = new Kafka({
      clientId: 'agent-orchestrator',
      brokers: kafkaConfig.brokers,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        factor: 2
      }
    });

    this.producer = this.kafka.producer({
      transactionTimeout: 30000,
      allowAutoTopicCreation: false
    });

    this.consumer = this.kafka.consumer({
      groupId: 'orchestrator-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    this.registry = registry;
    this.config = orchestrationConfig;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    logger.info('Starting Event-Driven Orchestrator', {
      pattern: this.config.pattern,
      maxConcurrentTasks: this.config.maxConcurrentTasks
    });

    // Initialize Kafka
    await this.producer.connect();
    await this.consumer.connect();

    // Subscribe to relevant topics based on orchestration pattern
    await this.subscribeToTopics();

    // Start message processing
    await this.consumer.run({
      eachMessage: this.handleMessage.bind(this)
    });

    this.isRunning = true;
    logger.info('Event-Driven Orchestrator started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Event-Driven Orchestrator');
    
    // Clean up active timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();

    await this.consumer.disconnect();
    await this.producer.disconnect();
    this.isRunning = false;

    logger.info('Event-Driven Orchestrator stopped');
  }

  /**
   * Submit a task for orchestrated execution
   * Implements orchestrator-worker pattern from Confluent research
   */
  async submitTask(request: Omit<TaskRequest, 'id'>): Promise<string> {
    const taskId = uuidv4();
    const taskRequest: TaskRequest = {
      id: taskId,
      ...request,
      metadata: {
        ...request.metadata,
        correlationId: request.metadata.correlationId || uuidv4()
      }
    };

    const correlatedLogger = addCorrelationId(taskRequest.metadata.correlationId);
    
    correlatedLogger.info('Submitting task for orchestration', {
      taskId,
      type: taskRequest.type,
      capabilities: taskRequest.requiredCapabilities,
      priority: taskRequest.priority
    });

    // Publish task request to Kafka topic
    await this.producer.send({
      topic: this.TASK_REQUESTS_TOPIC,
      messages: [{
        key: taskId,
        value: JSON.stringify(taskRequest),
        partition: this.getPartitionForTask(taskRequest)
      }]
    });

    return taskId;
  }

  /**
   * Publish agent event to the event stream
   */
  async publishEvent(event: Omit<AgentEvent, 'id' | 'timestamp'>): Promise<string> {
    const agentEvent: AgentEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ...event
    };

    await this.producer.send({
      topic: this.AGENT_EVENTS_TOPIC,
      messages: [{
        key: agentEvent.source,
        value: JSON.stringify(agentEvent)
      }]
    });

    return agentEvent.id;
  }

  private async subscribeToTopics(): Promise<void> {
    const topics = [
      this.TASK_REQUESTS_TOPIC,
      this.TASK_RESULTS_TOPIC,
      this.AGENT_EVENTS_TOPIC
    ];

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    logger.info('Subscribed to orchestration topics', { topics });
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    
    try {
      const messageValue = message.value?.toString();
      if (!messageValue) {
        return;
      }

      switch (topic) {
        case this.TASK_REQUESTS_TOPIC:
          await this.handleTaskRequest(JSON.parse(messageValue) as TaskRequest);
          break;

        case this.TASK_RESULTS_TOPIC:
          await this.handleTaskResult(JSON.parse(messageValue) as TaskResult);
          break;

        case this.AGENT_EVENTS_TOPIC:
          await this.handleAgentEvent(JSON.parse(messageValue) as AgentEvent);
          break;

        default:
          logger.warn('Received message for unknown topic', { topic });
      }

    } catch (error) {
      logger.error('Error processing message', {
        topic,
        partition: message.partition,
        offset: message.offset,
        error
      });
    }
  }

  private async handleTaskRequest(taskRequest: TaskRequest): Promise<void> {
    const correlatedLogger = addCorrelationId(taskRequest.metadata.correlationId);
    
    correlatedLogger.info('Processing task request', {
      taskId: taskRequest.id,
      type: taskRequest.type,
      capabilities: taskRequest.requiredCapabilities
    });

    // Check if we're at concurrent task limit
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      correlatedLogger.warn('Maximum concurrent tasks reached, deferring task', {
        taskId: taskRequest.id,
        activeTaskCount: this.activeTasks.size
      });
      // TODO: Implement task queue for deferred execution
      return;
    }

    // Find suitable agent based on required capabilities
    const suitableAgents = await this.findSuitableAgents(taskRequest.requiredCapabilities);
    
    if (suitableAgents.length === 0) {
      correlatedLogger.error('No suitable agents found for task', {
        taskId: taskRequest.id,
        requiredCapabilities: taskRequest.requiredCapabilities
      });
      
      await this.publishTaskFailure(taskRequest, 'NO_SUITABLE_AGENT', 'No agents available with required capabilities');
      return;
    }

    // Select best agent based on performance and availability
    const selectedAgent = this.selectOptimalAgent(suitableAgents);
    
    // Create task assignment
    const assignment: TaskAssignment = {
      taskId: taskRequest.id,
      agentId: selectedAgent.id,
      assignedAt: new Date(),
      estimatedCompletion: new Date(Date.now() + selectedAgent.performance.averageLatency),
      status: 'assigned'
    };

    // Track active task
    this.activeTasks.set(taskRequest.id, assignment);

    // Set task timeout
    const timeoutId = setTimeout(() => {
      this.handleTaskTimeout(taskRequest.id);
    }, this.config.taskTimeout);
    this.taskTimeouts.set(taskRequest.id, timeoutId);

    // Publish task assignment
    await this.producer.send({
      topic: this.TASK_ASSIGNMENTS_TOPIC,
      messages: [{
        key: taskRequest.id,
        value: JSON.stringify({
          assignment,
          taskRequest
        })
      }]
    });

    correlatedLogger.info('Task assigned to agent', {
      taskId: taskRequest.id,
      agentId: selectedAgent.id,
      agentName: selectedAgent.name
    });
  }

  private async handleTaskResult(result: TaskResult): Promise<void> {
    const assignment = this.activeTasks.get(result.taskId);
    if (!assignment) {
      logger.warn('Received result for unknown task', { taskId: result.taskId });
      return;
    }

    logger.info('Processing task result', {
      taskId: result.taskId,
      agentId: result.agentId,
      status: result.status,
      executionTime: result.executionTime
    });

    // Clean up tracking
    this.activeTasks.delete(result.taskId);
    const timeoutId = this.taskTimeouts.get(result.taskId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.taskTimeouts.delete(result.taskId);
    }

    // Update agent performance metrics
    const agent = await this.registry.getAgent(result.agentId);
    if (agent) {
      const newTotalExecutions = agent.performance.totalExecutions + 1;
      const newFailureCount = result.status === 'failure' ? agent.performance.failureCount + 1 : agent.performance.failureCount;
      const newSuccessRate = (newTotalExecutions - newFailureCount) / newTotalExecutions;
      const newAverageLatency = (agent.performance.averageLatency * agent.performance.totalExecutions + result.executionTime) / newTotalExecutions;

      await this.registry.updatePerformanceMetrics(result.agentId, {
        totalExecutions: newTotalExecutions,
        failureCount: newFailureCount,
        successRate: newSuccessRate,
        averageLatency: newAverageLatency
      });
    }

    // Publish completion event
    await this.publishEvent({
      type: 'task.completed',
      source: 'orchestrator',
      data: { taskResult: result },
      correlationId: result.taskId
    });
  }

  private async handleAgentEvent(event: AgentEvent): Promise<void> {
    logger.debug('Processing agent event', {
      eventId: event.id,
      type: event.type,
      source: event.source
    });

    // Handle agent lifecycle events
    switch (event.type) {
      case 'agent.registered':
        logger.info('Agent registered event received', { source: event.source });
        break;

      case 'agent.health.degraded':
        logger.warn('Agent health degraded', { source: event.source, data: event.data });
        break;

      case 'agent.offline':
        logger.error('Agent went offline', { source: event.source });
        // Reassign any active tasks from this agent
        await this.reassignTasksFromAgent(event.source);
        break;
    }
  }

  private async findSuitableAgents(requiredCapabilities: string[]) {
    const agents = await this.registry.getAllAgents();
    
    return agents.filter(agent => {
      // Check if agent is healthy
      if (agent.status !== 'healthy') {
        return false;
      }

      // Check if agent has all required capabilities
      const agentCapabilities = agent.capabilities.map(c => c.name);
      return requiredCapabilities.every(cap => agentCapabilities.includes(cap));
    });
  }

  private selectOptimalAgent(candidates: any[]) {
    // Sort by performance score (reliability * (1 / (latency + 1)))
    candidates.sort((a, b) => {
      const scoreA = a.performance.successRate / (a.performance.averageLatency + 1);
      const scoreB = b.performance.successRate / (b.performance.averageLatency + 1);
      return scoreB - scoreA;
    });

    return candidates[0];
  }

  private async handleTaskTimeout(taskId: string): Promise<void> {
    const assignment = this.activeTasks.get(taskId);
    if (!assignment) {
      return;
    }

    logger.error('Task timeout exceeded', {
      taskId,
      agentId: assignment.agentId,
      timeout: this.config.taskTimeout
    });

    // Update assignment status
    assignment.status = 'timeout';
    this.activeTasks.delete(taskId);
    this.taskTimeouts.delete(taskId);

    // Publish timeout event
    await this.publishEvent({
      type: 'task.timeout',
      source: 'orchestrator',
      data: { taskId, agentId: assignment.agentId }
    });
  }

  private async publishTaskFailure(
    taskRequest: TaskRequest,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    const result: TaskResult = {
      taskId: taskRequest.id,
      agentId: 'orchestrator',
      status: 'failure',
      error: {
        code: errorCode,
        message: errorMessage
      },
      executionTime: 0,
      completedAt: new Date()
    };

    await this.producer.send({
      topic: this.TASK_RESULTS_TOPIC,
      messages: [{
        key: taskRequest.id,
        value: JSON.stringify(result)
      }]
    });
  }

  private async reassignTasksFromAgent(agentId: string): Promise<void> {
    const tasksToReassign = Array.from(this.activeTasks.entries())
      .filter(([_, assignment]) => assignment.agentId === agentId)
      .map(([taskId, _]) => taskId);

    for (const taskId of tasksToReassign) {
      logger.info('Reassigning task from offline agent', { taskId, agentId });
      // TODO: Implement task reassignment logic
      this.activeTasks.delete(taskId);
      const timeoutId = this.taskTimeouts.get(taskId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.taskTimeouts.delete(taskId);
      }
    }
  }

  private getPartitionForTask(task: TaskRequest): number {
    // Use task priority to determine partition for load balancing
    switch (task.priority) {
      case 'critical': return 0;
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      default: return 3;
    }
  }
}
