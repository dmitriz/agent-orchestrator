/**
 * Core Agent Registry Interface
 * Implements the Tool/Agent Registry Pattern from CSIRO research
 */

export interface AgentCapability {
  name: string;
  type: 'action' | 'query' | 'analysis' | 'transformation';
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  maxConcurrency?: number;
  estimatedLatency?: number; // milliseconds
  costPerExecution?: number; // monetary units
  reliability?: number; // 0-1 score
}

export interface AgentMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  endpoint: string;
  capabilities: AgentCapability[];
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  tags: string[];
  lastHeartbeat: Date;
  registeredAt: Date;
  performance: {
    successRate: number;
    averageLatency: number;
    totalExecutions: number;
    failureCount: number;
  };
  constraints: {
    maxConcurrentTasks: number;
    rateLimitPerMinute: number;
    requiredResources: string[];
  };
}

export interface AgentRegistrationRequest {
  name: string;
  version: string;
  description: string;
  endpoint: string;
  capabilities: AgentCapability[];
  tags?: string[];
  constraints?: Partial<AgentMetadata['constraints']>;
}

export interface AgentQueryOptions {
  capability?: string;
  tags?: string[];
  status?: AgentMetadata['status'][];
  minReliability?: number;
  maxLatency?: number;
  sortBy?: 'reliability' | 'latency' | 'cost' | 'performance';
  limit?: number;
}

export interface HealthCheckResult {
  agentId: string;
  status: AgentMetadata['status'];
  latency: number;
  error?: string;
  timestamp: Date;
}

/**
 * Agent Registry Interface
 * Provides core registry operations following production patterns
 */
export interface IAgentRegistry {
  // Registration Management
  register(request: AgentRegistrationRequest): Promise<string>;
  unregister(agentId: string): Promise<boolean>;
  updateAgent(agentId: string, updates: Partial<AgentMetadata>): Promise<boolean>;

  // Discovery and Querying
  findAgents(options: AgentQueryOptions): Promise<AgentMetadata[]>;
  getAgent(agentId: string): Promise<AgentMetadata | null>;
  getAllAgents(): Promise<AgentMetadata[]>;
  getCapabilities(): Promise<AgentCapability[]>;

  // Health and Monitoring
  performHealthCheck(agentId: string): Promise<HealthCheckResult>;
  performHealthCheckAll(): Promise<HealthCheckResult[]>;
  updatePerformanceMetrics(agentId: string, metrics: Partial<AgentMetadata['performance']>): Promise<void>;

  // Marketplace Features (Future Extension)
  searchByCapability(capabilityName: string): Promise<AgentMetadata[]>;
  getRankedAgents(capability: string, criteria: 'cost' | 'performance' | 'reliability'): Promise<AgentMetadata[]>;
}
