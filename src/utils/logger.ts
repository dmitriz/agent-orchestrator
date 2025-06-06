/**
 * Structured Logging Utility
 * Production-ready logger with multiple transports and correlation tracking
 */

import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: logLevel,
  format: isProduction ? logFormat : devFormat,
  defaultMeta: {
    service: 'agent-orchestrator',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    new winston.transports.Console(),
    ...(isProduction ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: 'logs/app.log',
        maxsize: 10485760, // 10MB
        maxFiles: 10
      })
    ] : [])
  ]
});

/**
 * Add correlation ID to logs for request tracing
 */
export const addCorrelationId = (correlationId: string) => {
  return logger.child({ correlationId });
};

/**
 * Add agent context to logs
 */
export const addAgentContext = (agentId: string, agentName?: string) => {
  return logger.child({ agentId, agentName });
};

/**
 * Add workflow context to logs
 */
export const addWorkflowContext = (workflowId: string, workflowName?: string) => {
  return logger.child({ workflowId, workflowName });
};
