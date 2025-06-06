/**
 * Configuration Management
 * Environment-based configuration with simple validation
 */

const { logger } = require('../utils/logger');

/**
 * Get server configuration
 * @returns {Object} Server config
 */
const get_server_config = () => ({
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0'
});

/**
 * Get Redis configuration
 * @returns {Object} Redis config
 */
const get_redis_config = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0
});

/**
 * Get Kafka configuration
 * @returns {Object} Kafka config
 */
const get_kafka_config = () => ({
  brokers: process.env.KAFKA_BROKERS ? 
    process.env.KAFKA_BROKERS.split(',') : 
    ['localhost:9092'],
  client_id: process.env.KAFKA_CLIENT_ID || 'agent-orchestrator'
});

/**
 * Get orchestration configuration
 * @returns {Object} Orchestration config
 */
const get_orchestration_config = () => ({
  pattern: process.env.ORCHESTRATION_PATTERN || 'orchestrator_worker',
  max_concurrent_tasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 100,
  task_timeout: parseInt(process.env.TASK_TIMEOUT) || 300000, // 5 minutes
  retry_policy: {
    max_retries: parseInt(process.env.MAX_RETRIES) || 3,
    backoff_strategy: process.env.BACKOFF_STRATEGY || 'exponential',
    base_delay: parseInt(process.env.BASE_DELAY) || 1000
  },
  circuit_breaker: {
    failure_threshold: parseInt(process.env.FAILURE_THRESHOLD) || 5,
    recovery_timeout: parseInt(process.env.RECOVERY_TIMEOUT) || 60000,
    monitoring_window: parseInt(process.env.MONITORING_WINDOW) || 60000
  }
});

/**
 * Get logging configuration
 * @returns {Object} Logging config
 */
const get_logging_config = () => ({
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_TO_FILE === 'true'
});

/**
 * Validate configuration values
 * @param {Object} config - Configuration object to validate
 * @returns {boolean} True if valid
 */
const validate_config = (config) => {
  try {
    // Basic validation
    if (!config.server || typeof config.server.port !== 'number') {
      throw new Error('Invalid server configuration');
    }
    
    if (!config.redis || typeof config.redis.port !== 'number') {
      throw new Error('Invalid Redis configuration');
    }
    
    if (!config.kafka || !Array.isArray(config.kafka.brokers)) {
      throw new Error('Invalid Kafka configuration');
    }
    
    if (!config.orchestration || typeof config.orchestration.max_concurrent_tasks !== 'number') {
      throw new Error('Invalid orchestration configuration');
    }
    
    return true;
  } catch (error) {
    logger.error('Configuration validation failed', { error: error.message });
    return false;
  }
};

/**
 * Get complete application configuration
 * @returns {Object} Complete app config
 */
const get_app_config = () => {
  const config = {
    server: get_server_config(),
    redis: get_redis_config(),
    kafka: get_kafka_config(),
    orchestration: get_orchestration_config(),
    logging: get_logging_config()
  };
  
  if (!validate_config(config)) {
    throw new Error('Invalid configuration detected');
  }
  
  return config;
};

/**
 * Environment detection utilities
 */
const is_development = () => process.env.NODE_ENV === 'development';
const is_production = () => process.env.NODE_ENV === 'production';
const is_test = () => process.env.NODE_ENV === 'test';

module.exports = {
  get_app_config,
  get_server_config,
  get_redis_config,
  get_kafka_config,
  get_orchestration_config,
  get_logging_config,
  validate_config,
  is_development,
  is_production,
  is_test
};
