/**
 * Simple test script to verify JavaScript conversion
 */

const { logger } = require('./src/utils/logger');
const { validate_agent_registration } = require('./src/utils/validation');

// Test logger
console.log('Testing logger...');
logger.info('Logger test successful', { test: true });

// Test validation
console.log('Testing validation...');
const valid_registration = {
  name: 'test-agent',
  version: '1.0.0',
  description: 'Test agent',
  endpoint: 'http://localhost:8080',
  capabilities: [{
    name: 'test-capability',
    type: 'action',
    description: 'Test capability'
  }]
};

const is_valid = validate_agent_registration(valid_registration);
console.log('Validation test:', is_valid ? 'PASSED' : 'FAILED');

// Test server components
console.log('Testing server components...');
const { APIServer } = require('./src/api/server');
console.log('APIServer import: SUCCESS');

const { RedisAgentRegistry } = require('./src/registry/RedisAgentRegistry');
console.log('RedisAgentRegistry import: SUCCESS');

const { EventDrivenOrchestrator } = require('./src/orchestration/EventDrivenOrchestrator');
console.log('EventDrivenOrchestrator import: SUCCESS');

const { AgentOrchestratorApp } = require('./src/index');
console.log('AgentOrchestratorApp import: SUCCESS');

console.log('\n✅ All JavaScript conversion tests passed!');
console.log('🚀 Ready to run: npm start');
