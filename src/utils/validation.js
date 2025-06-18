/**
 * Simple validation utilities to replace TypeScript interfaces
 * Provides runtime validation for critical data structures
 */

/**
 * Validate agent capability object
 * @param {Object} capability - Capability object to validate
 * @returns {boolean} True if valid
 */
const validate_agent_capability = (capability) => {
  if (!capability || typeof capability !== 'object') {
    return false;
  }
  
  const required_fields = ['name', 'type', 'description'];
  const valid_types = ['action', 'query', 'analysis', 'transformation'];
  
  return required_fields.every(field => capability[field]) &&
         valid_types.includes(capability.type);
};

/**
 * Validate agent registration request
 * @param {Object} request - Registration request to validate
 * @returns {boolean} True if valid
 */
const validate_agent_registration = (request) => {
  if (!request || typeof request !== 'object') {
    return false;
  }
  
  const required_fields = ['name', 'version', 'description', 'endpoint', 'capabilities'];
  
  return required_fields.every(field => request[field]) &&
         Array.isArray(request.capabilities) &&
         request.capabilities.every(validate_agent_capability);
};

/**
 * Validate agent query options
 * @param {Object} options - Query options to validate
 * @returns {boolean} True if valid
 */
const validate_query_options = (options) => {
  if (!options || typeof options !== 'object') {
    return true; // Empty options are valid
  }
  
  const valid_sort_by = ['reliability', 'latency', 'cost', 'performance'];
  const valid_status = ['healthy', 'degraded', 'unhealthy', 'offline'];
  
  if (options.sort_by && !valid_sort_by.includes(options.sort_by)) {
    return false;
  }
  
  if (options.status && Array.isArray(options.status)) {
    return options.status.every(status => valid_status.includes(status));
  }
  
  return true;
};

/**
 * Create a default agent metadata object
 * @param {Object} registration - Registration request
 * @param {string} agent_id - Generated agent ID
 * @returns {Object} Agent metadata object
 */
const create_agent_metadata = (registration, agent_id) => {
  const now = new Date();
  
  return {
    id: agent_id,
    name: registration.name,
    version: registration.version,
    description: registration.description,
    endpoint: registration.endpoint,
    capabilities: registration.capabilities,
    status: 'healthy',
    tags: registration.tags || [],
    last_heartbeat: now,
    registered_at: now,
    performance: {
      success_rate: 1.0,
      average_latency: 0,
      total_executions: 0,
      failure_count: 0
    },
    constraints: {
      max_concurrent_tasks: 10,
      rate_limit_per_minute: 60,
      required_resources: [],
      ...registration.constraints
    }
  };
};

/**
 * Simple assertion helper for function parameters
 * @param {boolean} condition - Condition to assert
 * @param {string} message - Error message if assertion fails
 * @throws {Error} If condition is false
 */
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

module.exports = {
  validate_agent_capability,
  validate_agent_registration,
  validate_query_options,
  create_agent_metadata,
  assert
};
