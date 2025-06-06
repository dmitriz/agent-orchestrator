// Simple test to check if the basic modules work
console.log('Starting basic test...');

try {
  const { logger } = require('./src/utils/logger');
  console.log('✅ Logger imported successfully');
  
  logger.info('Test log message');
  console.log('✅ Logger test passed');
  
} catch (error) {
  console.error('❌ Logger test failed:', error.message);
}

try {
  const { validate_agent_registration } = require('./src/utils/validation');
  console.log('✅ Validation imported successfully');
  
  const test_data = {
    name: 'test',
    version: '1.0.0',
    description: 'test',
    endpoint: 'http://test',
    capabilities: [{
      name: 'test-cap',
      type: 'action',
      description: 'test capability'
    }]
  };
  
  const result = validate_agent_registration(test_data);
  console.log('✅ Validation test passed:', result);
  
} catch (error) {
  console.error('❌ Validation test failed:', error.message);
}

console.log('Basic test completed.');
