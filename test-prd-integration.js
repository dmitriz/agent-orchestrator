#!/usr/bin/env node

/**
 * PRD Integration Test Runner
 * 
 * Executes comprehensive tests for the PRD processing system
 * and generates detailed reports.
 */

const { PRDIntegrationTests } = require('./src/__tests__/prd-integration.test');
const fs = require('fs');
const path = require('path');

/**
 * Main test runner function
 */
async function run_prd_tests() {
    console.log('🧪 PRD Processing Integration Test Suite');
    console.log('=====================================\n');

    const test_runner = new PRDIntegrationTests();
    
    try {
        // Run all integration tests
        const test_summary = await test_runner.run_all_tests();
        
        // Run performance benchmarks
        const performance_metrics = await test_runner.run_performance_tests();
        
        // Generate comprehensive report
        const report = {
            test_run_info: {
                timestamp: new Date().toISOString(),
                node_version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            test_summary,
            performance_metrics,
            recommendations: generate_recommendations(test_summary, performance_metrics)
        };

        // Save report to file
        const report_path = path.join(__dirname, 'test-reports', `prd-integration-${Date.now()}.json`);
        
        // Ensure reports directory exists
        const reports_dir = path.dirname(report_path);
        if (!fs.existsSync(reports_dir)) {
            fs.mkdirSync(reports_dir, { recursive: true });
        }
        
        fs.writeFileSync(report_path, JSON.stringify(report, null, 2));
        
        console.log(`\n📄 Test report saved to: ${report_path}`);
        
        // Print final status
        if (test_summary.overall_status === 'PASS') {
            console.log('\n🎉 All tests passed! PRD processing system is ready for production.');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed. Please review the results above.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 Test runner encountered an error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Generate recommendations based on test results
 * @param {Object} test_summary - Test execution summary
 * @param {Object} performance_metrics - Performance test results
 * @returns {Array} Array of recommendation strings
 */
function generate_recommendations(test_summary, performance_metrics) {
    const recommendations = [];
    
    // Test-based recommendations
    if (test_summary.success_rate < 100) {
        recommendations.push('Review failed tests and fix identified issues before deployment');
    }
    
    if (test_summary.error_tests > 0) {
        recommendations.push('Investigate error conditions and improve error handling');
    }
    
    // Performance-based recommendations
    if (performance_metrics.total_time_ms > 5000) {
        recommendations.push('Consider optimizing PRD processing performance - total time exceeds 5 seconds');
    }
    
    if (performance_metrics.parse_time_ms > 1000) {
        recommendations.push('PRD parsing performance could be improved - consider caching or optimization');
    }
    
    if (performance_metrics.generate_time_ms > 2000) {
        recommendations.push('Task generation performance is slow - review complexity algorithms');
    }
    
    // General recommendations
    if (test_summary.success_rate === 100) {
        recommendations.push('System is ready for production deployment');
        recommendations.push('Consider adding monitoring and alerting for production usage');
        recommendations.push('Document the API endpoints and workflow for end users');
    }
    
    return recommendations;
}

/**
 * Run tests if script is executed directly
 */
if (require.main === module) {
    run_prd_tests().catch(error => {
        console.error('Failed to run tests:', error);
        process.exit(1);
    });
}

module.exports = { run_prd_tests };
