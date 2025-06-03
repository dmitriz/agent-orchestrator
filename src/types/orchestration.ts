/**
 * Event-Driven Orchestration Types
 * Based on Confluent's Event-Driven Multi-Agent Systems patterns
 */

export interface AgentEvent {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  data: Record<string, any>;
  correlationId?: string;
  parentEventId?: string;
}

export interface TaskRequest {
  id: string;
  type: string;
  payload: Record<string, any>;
  requiredCapabilities: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  deadline?: Date;
  metadata: {
    requestedBy: string;
    correlationId: string;
    retryCount: number;
    maxRetries: number;
  };
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  assignedAt: Date;
  estimatedCompletion: Date;
  status: 'assigned' | 'in_progress' | 'completed' | 'failed' | 'timeout';
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: 'success' | 'failure' | 'partial';
  result?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  executionTime: number;
  completedAt: Date;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  failurePolicy: 'abort' | 'continue' | 'retry';
  maxRetries: number;
  timeout: number; // milliseconds
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'task' | 'decision' | 'parallel' | 'sequential';
  requiredCapability?: string;
  dependencies: string[]; // step IDs
  condition?: string; // expression for conditional execution
  retryPolicy?: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential';
    baseDelay: number;
  };
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  currentStep?: string;
  results: Record<string, any>;
  context: Record<string, any>;
}

/**
 * Orchestration Patterns from Confluent Research
 */
export type OrchestrationPattern = 
  | 'orchestrator-worker'    // Central orchestrator with worker consumer groups
  | 'hierarchical'           // Recursive orchestrator-worker hierarchy
  | 'blackboard'            // Shared knowledge base pattern
  | 'market-based';         // Decentralized marketplace with bidding

export interface OrchestrationConfig {
  pattern: OrchestrationPattern;
  maxConcurrentTasks: number;
  taskTimeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential';
    baseDelay: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringWindow: number;
  };
}
