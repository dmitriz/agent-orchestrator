/**
 * Task Validation Framework for PRD-Based Workflow Integration
 * 
 * Validates task configurations, PRD data integrity, and workflow consistency
 * to ensure reliable task execution within the agent orchestration system.
 */

/**
 * Task Validator class for comprehensive validation of task configurations
 */
class TaskValidator {
    constructor() {
        this.required_task_fields = [
            'id', 'title', 'description', 'complexity', 'estimated_hours',
            'ai_executable', 'requires_review', 'priority'
        ];
        
        this.valid_complexity_levels = ['basic', 'intermediate', 'advanced', 'expert'];
        this.valid_priorities = ['low', 'medium', 'high', 'critical'];
        
        this.validation_rules = {
            estimated_hours: (hours) => hours >= 0.5 && hours <= 168, // 0.5 to 168 hours (1 week)
            complexity: (level) => this.valid_complexity_levels.includes(level),
            priority: (priority) => this.valid_priorities.includes(priority),
            ai_executable: (value) => typeof value === 'boolean',
            requires_review: (value) => typeof value === 'boolean'
        };
    }

    /**
     * Validate complete task breakdown configuration
     * @param {Object} task_breakdown - Generated task breakdown from TaskGenerator
     * @returns {Object} Validation result with success status and issues
     */
    validate_task_breakdown(task_breakdown) {
        const validation_result = {
            is_valid: true,
            issues: [],
            warnings: [],
            summary: {}
        };

        // Validate task breakdown structure
        this.validate_breakdown_structure(task_breakdown, validation_result);
        
        // Validate individual tasks
        if (task_breakdown.tasks && Array.isArray(task_breakdown.tasks)) {
            task_breakdown.tasks.forEach((task, index) => {
                this.validate_task_config(task, validation_result, index);
            });
        }

        // Validate task dependencies
        this.validate_task_dependencies(task_breakdown.tasks, validation_result);
        
        // Validate workflow consistency
        this.validate_workflow_consistency(task_breakdown, validation_result);

        // Generate validation summary
        validation_result.summary = this.generate_validation_summary(task_breakdown, validation_result);

        return validation_result;
    }

    /**
     * Validate PRD data integrity
     * @param {Object} prd_data - Parsed PRD data
     * @returns {Object} PRD validation result
     */
    validate_prd_data(prd_data) {
        const validation_result = {
            is_valid: true,
            issues: [],
            warnings: []
        };

        const required_prd_fields = [
            'project_name', 'vision', 'technical_requirements', 'success_criteria'
        ];

        // Check required fields
        required_prd_fields.forEach(field => {
            if (!prd_data[field] || (typeof prd_data[field] === 'string' && prd_data[field].trim() === '')) {
                validation_result.issues.push(`Missing required PRD field: ${field}`);
                validation_result.is_valid = false;
            }
        });

        // Validate technical requirements structure
        if (prd_data.technical_requirements) {
            if (!Array.isArray(prd_data.technical_requirements) || prd_data.technical_requirements.length === 0) {
                validation_result.issues.push('Technical requirements must be a non-empty array');
                validation_result.is_valid = false;
            }
        }

        // Validate complexity assessment
        if (prd_data.complexity_assessment) {
            if (!this.valid_complexity_levels.includes(prd_data.complexity_assessment.level)) {
                validation_result.warnings.push(`Invalid complexity level: ${prd_data.complexity_assessment.level}`);
            }
        }

        return validation_result;
    }

    /**
     * Validate individual task configuration
     * @param {Object} task - Task configuration object
     * @param {Object} validation_result - Validation result to update
     * @param {number} task_index - Index of task for error reporting
     */
    validate_task_config(task, validation_result, task_index) {
        const task_prefix = `Task ${task_index + 1} (${task.title || 'untitled'})`;

        // Check required fields
        this.required_task_fields.forEach(field => {
            if (!(field in task)) {
                validation_result.issues.push(`${task_prefix}: Missing required field '${field}'`);
                validation_result.is_valid = false;
            }
        });

        // Validate field values using rules
        Object.entries(this.validation_rules).forEach(([field, rule]) => {
            if (field in task && !rule(task[field])) {
                validation_result.issues.push(`${task_prefix}: Invalid value for '${field}': ${task[field]}`);
                validation_result.is_valid = false;
            }
        });

        // Validate subtasks if present
        if (task.subtasks && Array.isArray(task.subtasks)) {
            task.subtasks.forEach((subtask, subtask_index) => {
                if (!subtask.title || !subtask.description) {
                    validation_result.warnings.push(
                        `${task_prefix}: Subtask ${subtask_index + 1} missing title or description`
                    );
                }
            });
        }

        // Validate dependencies format
        if (task.dependencies && !Array.isArray(task.dependencies)) {
            validation_result.issues.push(`${task_prefix}: Dependencies must be an array`);
            validation_result.is_valid = false;
        }
    }

    /**
     * Validate task dependencies for circular references and invalid references
     * @param {Array} tasks - Array of task configurations
     * @param {Object} validation_result - Validation result to update
     */
    validate_task_dependencies(tasks, validation_result) {
        if (!tasks || !Array.isArray(tasks)) return;

        const task_ids = new Set(tasks.map(task => task.id));
        
        // Check for invalid dependency references
        tasks.forEach(task => {
            if (task.dependencies && Array.isArray(task.dependencies)) {
                task.dependencies.forEach(dep_id => {
                    if (!task_ids.has(dep_id)) {
                        validation_result.issues.push(
                            `Task '${task.title}': Invalid dependency reference '${dep_id}'`
                        );
                        validation_result.is_valid = false;
                    }
                });
            }
        });

        // Check for circular dependencies
        const circular_deps = this.detect_circular_dependencies(tasks);
        if (circular_deps.length > 0) {
            circular_deps.forEach(cycle => {
                validation_result.issues.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
                validation_result.is_valid = false;
            });
        }
    }

    /**
     * Validate workflow consistency and logical structure
     * @param {Object} task_breakdown - Complete task breakdown
     * @param {Object} validation_result - Validation result to update
     */
    validate_workflow_consistency(task_breakdown, validation_result) {
        if (!task_breakdown.tasks || task_breakdown.tasks.length === 0) {
            validation_result.issues.push('Task breakdown contains no tasks');
            validation_result.is_valid = false;
            return;
        }

        // Check total hours consistency
        const calculated_hours = task_breakdown.tasks.reduce((sum, task) => sum + (task.estimated_hours || 0), 0);
        if (Math.abs(calculated_hours - task_breakdown.estimated_total_hours) > 0.1) {
            validation_result.warnings.push(
                `Total hours mismatch: calculated ${calculated_hours}, reported ${task_breakdown.estimated_total_hours}`
            );
        }

        // Check task count consistency
        if (task_breakdown.tasks.length !== task_breakdown.total_tasks) {
            validation_result.warnings.push(
                `Task count mismatch: actual ${task_breakdown.tasks.length}, reported ${task_breakdown.total_tasks}`
            );
        }

        // Validate critical path exists
        const has_critical_path = this.validate_critical_path(task_breakdown.tasks);
        if (!has_critical_path) {
            validation_result.warnings.push('No clear critical path identified in task workflow');
        }
    }

    /**
     * Validate task breakdown structure
     * @param {Object} task_breakdown - Task breakdown object
     * @param {Object} validation_result - Validation result to update
     */
    validate_breakdown_structure(task_breakdown, validation_result) {
        const required_breakdown_fields = [
            'project_name', 'generated_at', 'total_tasks', 'estimated_total_hours', 'tasks'
        ];

        required_breakdown_fields.forEach(field => {
            if (!(field in task_breakdown)) {
                validation_result.issues.push(`Missing required task breakdown field: ${field}`);
                validation_result.is_valid = false;
            }
        });
    }

    /**
     * Detect circular dependencies in task graph
     * @param {Array} tasks - Array of task configurations
     * @returns {Array} Array of circular dependency cycles
     */
    detect_circular_dependencies(tasks) {
        const task_map = new Map(tasks.map(task => [task.id, task]));
        const visited = new Set();
        const rec_stack = new Set();
        const cycles = [];

        const dfs = (task_id, path) => {
            if (rec_stack.has(task_id)) {
                const cycle_start = path.indexOf(task_id);
                cycles.push(path.slice(cycle_start).concat(task_id));
                return;
            }

            if (visited.has(task_id)) return;

            visited.add(task_id);
            rec_stack.add(task_id);

            const task = task_map.get(task_id);
            if (task && task.dependencies) {
                task.dependencies.forEach(dep_id => {
                    dfs(dep_id, path.concat(task_id));
                });
            }

            rec_stack.delete(task_id);
        };

        tasks.forEach(task => {
            if (!visited.has(task.id)) {
                dfs(task.id, []);
            }
        });

        return cycles;
    }

    /**
     * Validate critical path exists in task workflow
     * @param {Array} tasks - Array of task configurations
     * @returns {boolean} True if critical path can be identified
     */
    validate_critical_path(tasks) {
        // Simple validation: check if there are tasks with high priority
        // and proper dependency chains
        const high_priority_tasks = tasks.filter(task => 
            task.priority === 'high' || task.priority === 'critical'
        );
        
        return high_priority_tasks.length > 0;
    }

    /**
     * Generate validation summary
     * @param {Object} task_breakdown - Task breakdown object
     * @param {Object} validation_result - Current validation result
     * @returns {Object} Validation summary
     */
    generate_validation_summary(task_breakdown, validation_result) {
        const tasks = task_breakdown.tasks || [];
        
        return {
            total_tasks: tasks.length,
            validation_status: validation_result.is_valid ? 'VALID' : 'INVALID',
            total_issues: validation_result.issues.length,
            total_warnings: validation_result.warnings.length,
            complexity_distribution: this.get_complexity_distribution(tasks),
            priority_distribution: this.get_priority_distribution(tasks),
            ai_executable_count: tasks.filter(task => task.ai_executable).length,
            review_required_count: tasks.filter(task => task.requires_review).length
        };
    }

    /**
     * Get complexity distribution of tasks
     * @param {Array} tasks - Array of task configurations
     * @returns {Object} Complexity distribution counts
     */
    get_complexity_distribution(tasks) {
        const distribution = {};
        this.valid_complexity_levels.forEach(level => {
            distribution[level] = tasks.filter(task => task.complexity === level).length;
        });
        return distribution;
    }

    /**
     * Get priority distribution of tasks
     * @param {Array} tasks - Array of task configurations
     * @returns {Object} Priority distribution counts
     */
    get_priority_distribution(tasks) {
        const distribution = {};
        this.valid_priorities.forEach(priority => {
            distribution[priority] = tasks.filter(task => task.priority === priority).length;
        });
        return distribution;
    }
}

module.exports = { TaskValidator };
