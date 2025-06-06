/**
 * Structured Logging Utility
 * Production-ready logger with multiple transports and correlation tracking
 */

const winston = require('winston');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const log_format = winston.format.combine(
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

const dev_format = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const meta_str = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}] ${message} ${meta_str}`;
  })
);

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: IS_PRODUCTION ? log_format : dev_format,
  defaultMeta: {
    service: 'agent-orchestrator',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    new winston.transports.Console(),
    ...(IS_PRODUCTION ? [
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
 * @param {string} correlation_id - Unique identifier for request correlation
 * @returns {Object} Child logger with correlation context
 */
const add_correlation_id = (correlation_id) => {
  return logger.child({ correlation_id });
};

/**
 * Add agent context to logs
 * @param {string} agent_id - Agent identifier
 * @param {string} [agent_name] - Optional agent name
 * @returns {Object} Child logger with agent context
 */
const add_agent_context = (agent_id, agent_name) => {
  return logger.child({ agent_id, agent_name });
};

/**
 * Add workflow context to logs
 * @param {string} workflow_id - Workflow identifier
 * @param {string} [workflow_name] - Optional workflow name
 * @returns {Object} Child logger with workflow context
 */
const add_workflow_context = (workflow_id, workflow_name) => {
  return logger.child({ workflow_id, workflow_name });
};

module.exports = {
  logger,
  add_correlation_id,
  add_agent_context,
  add_workflow_context
};
