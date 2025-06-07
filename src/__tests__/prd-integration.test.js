/**
 * Integration Tests for PRD Processing System
 * 
 * Tests the complete PRD → Task Generation → Validation workflow
 * within the agent-orchestrator framework.
 */

const PRDParser = require('../prd/prd-parser');
const TaskGenerator = require('../prd/task-generator');
const { TaskValidator } = require('../validation/task-validator');

/**
 * PRD Integration Test Suite
 */
class PRDIntegrationTests {
    constructor() {
        this.prd_parser = new PRDParser();
        this.task_generator = new TaskGenerator();
        this.task_validator = new TaskValidator();
        this.test_results = [];
    }

    /**
     * Run all integration tests
     * @returns {Object} Test results summary
     */
    async run_all_tests() {
        console.log('🚀 Starting PRD Integration Tests...\n');

        await this.test_prd_parsing();
        await this.test_task_generation();
        await this.test_task_validation();
        await this.test_complete_workflow();
        await this.test_error_handling();

        return this.generate_test_summary();
    }

    /**
     * Test PRD parsing functionality
     */
    async test_prd_parsing() {
        console.log('📄 Testing PRD Parsing...');

        const test_prd_content = `
# Project Name
Agent Orchestrator Enhancement

## Vision
Enhance the existing agent orchestrator with PRD processing capabilities to enable automated task breakdown and agent assignment.

## Technical Requirements
- Implement PRD parser for markdown documents
- Create task generation engine
- Build validation framework
- Integrate with existing orchestration system

## Success Criteria
- Parse PRD documents with 95% accuracy
- Generate executable task breakdowns
- Validate task configurations
- Integrate seamlessly with existing API

## Dependencies
- Express.js framework
- Redis for agent registry
- UUID for task identification

## Constraints
- Must maintain backwards compatibility
- Performance should not degrade existing functionality
- Memory usage should remain under 512MB

## Complexity Assessment
Level: Advanced
Reasoning: Requires integration with existing systems and complex parsing logic

## Timeline
Estimated completion: 2-3 weeks

## Risk Factors
- Integration complexity with existing orchestrator
- Performance impact on existing workflows

## Stakeholders
- Development team
- Operations team
- End users
        `;

        try {
            const parsed_data = this.prd_parser.parse_prd_content(test_prd_content);
            
            // Validate parsed data structure
            const required_fields = ['project_name', 'vision', 'technical_requirements', 'success_criteria'];
            const missing_fields = required_fields.filter(field => !parsed_data[field]);
            
            if (missing_fields.length === 0) {
                this.add_test_result('PRD Parsing', 'PASS', 'All required fields extracted successfully');
                console.log('  ✅ PRD parsing successful');
            } else {
                this.add_test_result('PRD Parsing', 'FAIL', `Missing fields: ${missing_fields.join(', ')}`);
                console.log('  ❌ PRD parsing failed - missing fields');
            }

        } catch (error) {
            this.add_test_result('PRD Parsing', 'ERROR', error.message);
            console.log('  ❌ PRD parsing error:', error.message);
        }
    }

    /**
     * Test task generation functionality
     */
    async test_task_generation() {
        console.log('⚙️  Testing Task Generation...');

        const test_prd_data = {
            project_name: 'Test Project',
            vision: 'Test vision',
            technical_requirements: [
                'Implement PRD parser',
                'Create task generator',
                'Build validation system'
            ],
            success_criteria: ['Parser accuracy > 95%', 'Task generation complete'],
            complexity_assessment: { level: 'intermediate' }
        };

        try {
            const task_breakdown = this.task_generator.generate_task_breakdown(test_prd_data);
            
            // Validate task breakdown structure
            const required_breakdown_fields = ['project_name', 'total_tasks', 'estimated_total_hours', 'tasks'];
            const missing_breakdown_fields = required_breakdown_fields.filter(field => !task_breakdown[field]);
            
            if (missing_breakdown_fields.length === 0 && task_breakdown.tasks.length > 0) {
                this.add_test_result('Task Generation', 'PASS', 
                    `Generated ${task_breakdown.tasks.length} tasks with ${task_breakdown.estimated_total_hours} total hours`);
                console.log(`  ✅ Task generation successful - ${task_breakdown.tasks.length} tasks generated`);
            } else {
                this.add_test_result('Task Generation', 'FAIL', 
                    `Missing fields: ${missing_breakdown_fields.join(', ')} or no tasks generated`);
                console.log('  ❌ Task generation failed');
            }

        } catch (error) {
            this.add_test_result('Task Generation', 'ERROR', error.message);
            console.log('  ❌ Task generation error:', error.message);
        }
    }

    /**
     * Test task validation functionality
     */
    async test_task_validation() {
        console.log('✅ Testing Task Validation...');

        const test_task_breakdown = {
            project_name: 'Test Project',
            generated_at: new Date().toISOString(),
            total_tasks: 2,
            estimated_total_hours: 16,
            complexity_level: 'intermediate',
            tasks: [
                {
                    id: 'task-1',
                    title: 'Test Task 1',
                    description: 'First test task',
                    complexity: 'intermediate',
                    estimated_hours: 8,
                    ai_executable: true,
                    requires_review: false,
                    priority: 'high',
                    dependencies: []
                },
                {
                    id: 'task-2',
                    title: 'Test Task 2',
                    description: 'Second test task',
                    complexity: 'basic',
                    estimated_hours: 8,
                    ai_executable: true,
                    requires_review: true,
                    priority: 'medium',
                    dependencies: ['task-1']
                }
            ]
        };

        try {
            const validation_result = this.task_validator.validate_task_breakdown(test_task_breakdown);
            
            if (validation_result.is_valid) {
                this.add_test_result('Task Validation', 'PASS', 
                    `Validation successful with ${validation_result.warnings.length} warnings`);
                console.log('  ✅ Task validation successful');
            } else {
                this.add_test_result('Task Validation', 'FAIL', 
                    `Validation failed with ${validation_result.issues.length} issues`);
                console.log('  ❌ Task validation failed');
            }

        } catch (error) {
            this.add_test_result('Task Validation', 'ERROR', error.message);
            console.log('  ❌ Task validation error:', error.message);
        }
    }

    /**
     * Test complete workflow integration
     */
    async test_complete_workflow() {
        console.log('🔄 Testing Complete Workflow...');

        const test_prd_content = `
# Project Name
Complete Workflow Test

## Vision
Test the complete PRD to task workflow

## Technical Requirements
- Parse this PRD
- Generate tasks
- Validate results

## Success Criteria
- End-to-end workflow completion
- All validation passes

## Complexity Assessment
Level: Basic
        `;

        try {
            // Step 1: Parse PRD
            const prd_data = this.prd_parser.parse_prd_content(test_prd_content);
            
            // Step 2: Generate tasks
            const task_breakdown = this.task_generator.generate_task_breakdown(prd_data);
            
            // Step 3: Validate results
            const prd_validation = this.task_validator.validate_prd_data(prd_data);
            const task_validation = this.task_validator.validate_task_breakdown(task_breakdown);
            
            if (prd_validation.is_valid && task_validation.is_valid) {
                this.add_test_result('Complete Workflow', 'PASS', 
                    'End-to-end workflow completed successfully');
                console.log('  ✅ Complete workflow integration successful');
            } else {
                this.add_test_result('Complete Workflow', 'FAIL', 
                    'Workflow completed but validation failed');
                console.log('  ❌ Complete workflow integration failed');
            }

        } catch (error) {
            this.add_test_result('Complete Workflow', 'ERROR', error.message);
            console.log('  ❌ Complete workflow error:', error.message);
        }
    }

    /**
     * Test error handling scenarios
     */
    async test_error_handling() {
        console.log('🛡️  Testing Error Handling...');

        try {
            // Test invalid PRD content
            try {
                this.prd_parser.parse_prd_content('');
                this.add_test_result('Error Handling', 'FAIL', 'Empty PRD should throw error');
            } catch (error) {
                this.add_test_result('Error Handling', 'PASS', 'Empty PRD correctly rejected');
            }

            // Test invalid task data
            try {
                this.task_validator.validate_task_breakdown({});
                this.add_test_result('Error Handling', 'FAIL', 'Empty task breakdown should fail validation');
            } catch (error) {
                this.add_test_result('Error Handling', 'PASS', 'Empty task breakdown correctly rejected');
            }

            console.log('  ✅ Error handling tests completed');

        } catch (error) {
            this.add_test_result('Error Handling', 'ERROR', error.message);
            console.log('  ❌ Error handling test error:', error.message);
        }
    }

    /**
     * Add test result to results array
     * @param {string} test_name - Name of the test
     * @param {string} status - Test status (PASS, FAIL, ERROR)
     * @param {string} message - Test result message
     */
    add_test_result(test_name, status, message) {
        this.test_results.push({
            test_name,
            status,
            message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Generate test summary report
     * @returns {Object} Test summary
     */
    generate_test_summary() {
        const total_tests = this.test_results.length;
        const passed_tests = this.test_results.filter(r => r.status === 'PASS').length;
        const failed_tests = this.test_results.filter(r => r.status === 'FAIL').length;
        const error_tests = this.test_results.filter(r => r.status === 'ERROR').length;

        const summary = {
            total_tests,
            passed_tests,
            failed_tests,
            error_tests,
            success_rate: total_tests > 0 ? (passed_tests / total_tests * 100).toFixed(1) : 0,
            results: this.test_results,
            overall_status: failed_tests === 0 && error_tests === 0 ? 'PASS' : 'FAIL'
        };

        console.log('\n📊 Test Summary:');
        console.log(`  Total Tests: ${total_tests}`);
        console.log(`  Passed: ${passed_tests}`);
        console.log(`  Failed: ${failed_tests}`);
        console.log(`  Errors: ${error_tests}`);
        console.log(`  Success Rate: ${summary.success_rate}%`);
        console.log(`  Overall Status: ${summary.overall_status}`);

        return summary;
    }

    /**
     * Run performance benchmarks
     * @returns {Object} Performance metrics
     */
    async run_performance_tests() {
        console.log('\n⚡ Running Performance Tests...');

        const large_prd_content = `
# Project Name
Performance Test Project

## Vision
${'Test large PRD processing performance. '.repeat(100)}

## Technical Requirements
${Array.from({length: 50}, (_, i) => `- Requirement ${i + 1}: Test requirement for performance analysis`).join('\n')}

## Success Criteria
${Array.from({length: 20}, (_, i) => `- Criteria ${i + 1}: Performance test criteria`).join('\n')}

## Complexity Assessment
Level: Expert
        `;

        const performance_metrics = {};

        // Test PRD parsing performance
        const parse_start = Date.now();
        const prd_data = this.prd_parser.parse_prd_content(large_prd_content);
        performance_metrics.parse_time_ms = Date.now() - parse_start;

        // Test task generation performance
        const generate_start = Date.now();
        const task_breakdown = this.task_generator.generate_task_breakdown(prd_data);
        performance_metrics.generate_time_ms = Date.now() - generate_start;

        // Test validation performance
        const validate_start = Date.now();
        this.task_validator.validate_task_breakdown(task_breakdown);
        performance_metrics.validate_time_ms = Date.now() - validate_start;

        performance_metrics.total_time_ms = performance_metrics.parse_time_ms + 
                                           performance_metrics.generate_time_ms + 
                                           performance_metrics.validate_time_ms;

        console.log('  📈 Performance Results:');
        console.log(`    Parse Time: ${performance_metrics.parse_time_ms}ms`);
        console.log(`    Generate Time: ${performance_metrics.generate_time_ms}ms`);
        console.log(`    Validate Time: ${performance_metrics.validate_time_ms}ms`);
        console.log(`    Total Time: ${performance_metrics.total_time_ms}ms`);

        return performance_metrics;
    }
}

module.exports = { PRDIntegrationTests };
