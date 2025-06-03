/**
 * Configuration Management
 * Environment-based configuration with validation
 */

import Joi from 'joi';

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  kafka: {
    brokers: string[];
    clientId: string;
  };
  orchestration: {
    pattern: 'orchestrator-worker' | 'hierarchical' | 'blackboard' | 'market-based';
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
  };
  logging: {
    level: string;
    file: boolean;
  };
}

const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().port().default(3000),
    host: Joi.string().default('0.0.0.0')
  }).default(),
  
  redis: Joi.object({
    host: Joi.string().default('localhost'),
    port: Joi.number().port().default(6379),
    password: Joi.string().optional(),
    db: Joi.number().min(0).default(0)
  }).default(),
  
  kafka: Joi.object({
    brokers: Joi.array().items(Joi.string()).min(1).default(['localhost:9092']),
    clientId: Joi.string().default('agent-orchestrator')
  }).default(),
  
  orchestration: Joi.object({
    pattern: Joi.string()
      .valid('orchestrator-worker', 'hierarchical', 'blackboard', 'market-based')
      .default('orchestrator-worker'),
    maxConcurrentTasks: Joi.number().min(1).default(100),
    taskTimeout: Joi.number().min(1000).default(300000), // 5 minutes
    retryPolicy: Joi.object({
      maxRetries: Joi.number().min(0).default(3),
      backoffStrategy: Joi.string().valid('linear', 'exponential').default('exponential'),
      baseDelay: Joi.number().min(100).default(1000)
    }).default(),
    circuitBreaker: Joi.object({
      failureThreshold: Joi.number().min(1).default(5),
      recoveryTimeout: Joi.number().min(1000).default(60000), // 1 minute
      monitoringWindow: Joi.number().min(1000).default(300000) // 5 minutes
    }).default()
  }).default(),
  
  logging: Joi.object({
    level: Joi.string()
      .valid('error', 'warn', 'info', 'debug', 'verbose')
      .default('info'),
    file: Joi.boolean().default(true)
  }).default()
});

function loadConfig(): AppConfig {
  const rawConfig = {
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0'
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10)
    },
    kafka: {
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
      clientId: process.env.KAFKA_CLIENT_ID || 'agent-orchestrator'
    },
    orchestration: {
      pattern: process.env.ORCHESTRATION_PATTERN || 'orchestrator-worker',
      maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '100', 10),
      taskTimeout: parseInt(process.env.TASK_TIMEOUT || '300000', 10),
      retryPolicy: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        backoffStrategy: process.env.BACKOFF_STRATEGY || 'exponential',
        baseDelay: parseInt(process.env.BASE_DELAY || '1000', 10)
      },
      circuitBreaker: {
        failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10),
        recoveryTimeout: parseInt(process.env.CB_RECOVERY_TIMEOUT || '60000', 10),
        monitoringWindow: parseInt(process.env.CB_MONITORING_WINDOW || '300000', 10)
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE !== 'false'
    }
  };

  const { error, value } = configSchema.validate(rawConfig);
  
  if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
  }

  return value as AppConfig;
}

export const config = loadConfig();
