/**
 * Task Generation Engine for PRD-Based Workflow Creation
 * 
 * Converts PRD technical requirements into structured TaskConfig objects
 * with appropriate complexity levels, dependencies, and subtask breakdowns.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Task Generation Engine class
 */
class TaskGenerator {
    constructor() {
        this.complexity_keywords = {
            'basic': ['create', 'configure', 'setup', 'install', 'update'],
            'intermediate': ['implement', 'build', 'develop', 'integrate', 'design'],
            'advanced': ['optimize', 'coordinate', 'orchestrate', 'automate', 'enhance'],
            'expert': ['architect', 'complex', 'scale', 'enterprise', 'advanced']
        };

        this.dependency_patterns = {
            'processing': ['parser', 'validation', 'extraction'],
            'coordination': ['processing', 'assignment', 'orchestration'],
            'assignment': ['processing', 'specialization'],
            'tracking': ['coordination', 'assignment'],
            'workflow': ['processing', 'coordination'],
            'handoff': ['coordination', 'specialization'],
            'checkpoint': ['workflow', 'tracking']
        };
    }

    /**
     * Generate task breakdown from PRD data
     * @param {Object} prd_data - Parsed PRD data
     * @returns {Object} Task breakdown with tasks and metadata
     */
    generate_task_breakdown(prd_data) {
        const tasks = this.create_tasks_from_requirements(prd_data.technical_requirements);
        const task_dependencies = this.resolve_task_dependencies(tasks);
        const enhanced_tasks = this.enhance_tasks_with_context(tasks, prd_data);

        return {
            project_name: prd_data.project_name,
            generated_at: new Date().toISOString(),
            total_tasks: enhanced_tasks.length,
            estimated_total_hours: this.calculate_total_hours(enhanced_tasks),
            complexity_level: prd_data.complexity_assessment.level,
            tasks: enhanced_tasks
        };
    }

    /**
     * Create tasks from technical requirements
     * @param {Array<string>} requirements - Technical requirements
     * @returns {Array<Object>} Generated tasks
     */
    create_tasks_from_requirements(requirements) {
        const tasks = [];

        requirements.forEach((requirement, index) => {
            const task = {
                id: `task-${String(index + 1).padStart(3, '0')}`,
                title: requirement,
                description: `Implement: ${requirement}`,
                complexity_level: this.determine_complexity(requirement),
                dependencies: [],
                ai_executable: this.is_ai_executable(requirement),
                review_required: this.requires_review(requirement),
                estimated_hours: this.estimate_hours(requirement),
                priority: this.determine_priority(requirement, index),
                subtasks: this.generate_subtasks(requirement, index + 1)
            };

            tasks.push(task);
        });

        return tasks;
    }

    /**
     * Determine complexity level of a requirement
     * @param {string} requirement - Technical requirement
     * @returns {string} Complexity level
     */
    determine_complexity(requirement) {
        const lower_requirement = requirement.toLowerCase();

        for (const [level, keywords] of Object.entries(this.complexity_keywords)) {
            if (keywords.some(keyword => lower_requirement.includes(keyword))) {
                return level;
            }
        }

        // Default complexity based on requirement length and technical terms
        if (lower_requirement.includes('complex') || lower_requirement.includes('architecture')) {
            return 'expert';
        } else if (lower_requirement.includes('automate') || lower_requirement.includes('integration')) {
            return 'advanced';
        } else if (lower_requirement.includes('implement') || lower_requirement.includes('develop')) {
            return 'intermediate';
        }

        return 'basic';
    }

    /**
     * Check if task can be executed by AI
     * @param {string} requirement - Technical requirement
     * @returns {boolean} Whether AI can execute this task
     */
    is_ai_executable(requirement) {
        const lower_requirement = requirement.toLowerCase();
        const non_ai_keywords = ['manual', 'human', 'review', 'approve', 'decision'];
        
        return !non_ai_keywords.some(keyword => lower_requirement.includes(keyword));
    }

    /**
     * Check if task requires human review
     * @param {string} requirement - Technical requirement
     * @returns {boolean} Whether task requires review
     */
    requires_review(requirement) {
        const lower_requirement = requirement.toLowerCase();
        const review_keywords = ['complex', 'critical', 'security', 'architecture', 'integration'];
        
        return review_keywords.some(keyword => lower_requirement.includes(keyword));
    }

    /**
     * Estimate hours for a requirement
     * @param {string} requirement - Technical requirement
     * @returns {number} Estimated hours
     */
    estimate_hours(requirement) {
        const complexity = this.determine_complexity(requirement);
        const base_hours = {
            'basic': 4,
            'intermediate': 8,
            'advanced': 16,
            'expert': 24
        };

        let hours = base_hours[complexity];

        // Adjust based on requirement content
        const lower_requirement = requirement.toLowerCase();
        if (lower_requirement.includes('automate') || lower_requirement.includes('integration')) {
            hours *= 1.5;
        }
        if (lower_requirement.includes('test') || lower_requirement.includes('validation')) {
            hours *= 0.75;
        }

        return Math.round(hours);
    }

    /**
     * Determine task priority
     * @param {string} requirement - Technical requirement
     * @param {number} index - Task index (for ordering)
     * @returns {string} Priority level
     */
    determine_priority(requirement, index) {
        const lower_requirement = requirement.toLowerCase();

        // Critical foundation tasks
        if (lower_requirement.includes('processing') || lower_requirement.includes('parser')) {
            return 'critical';
        }

        // High priority coordination tasks
        if (lower_requirement.includes('coordination') || lower_requirement.includes('assignment')) {
            return 'high';
        }

        // First few tasks are typically higher priority
        if (index <= 2) {
            return 'critical';
        } else if (index <= 4) {
            return 'high';
        }

        return 'medium';
    }

    /**
     * Generate subtasks for a requirement
     * @param {string} requirement - Technical requirement
     * @param {number} task_number - Task number for ID generation
     * @returns {Array<Object>} Subtasks
     */
    generate_subtasks(requirement, task_number) {
        const subtasks = [];
        const task_id_prefix = `task-${String(task_number).padStart(3, '0')}`;

        // Design subtask
        subtasks.push({
            id: `${task_id_prefix}-01`,
            title: `Design ${requirement}`,
            description: `Create design and implementation plan for ${requirement}`,
            estimated_complexity: 3,
            ai_prompt: `Design implementation approach for: ${requirement}`,
            success_criteria: [
                'Design document created',
                'Implementation plan approved'
            ]
        });

        // Implementation subtask
        subtasks.push({
            id: `${task_id_prefix}-02`,
            title: `Implement ${requirement}`,
            description: `Core implementation of ${requirement}`,
            estimated_complexity: 6,
            ai_prompt: `Implement the following requirement: ${requirement}`,
            success_criteria: [
                'Code implementation complete',
                'Basic testing passes'
            ]
        });

        // Testing subtask
        subtasks.push({
            id: `${task_id_prefix}-03`,
            title: `Test ${requirement}`,
            description: `Comprehensive testing of ${requirement}`,
            estimated_complexity: 3,
            ai_prompt: `Create comprehensive tests for: ${requirement}`,
            success_criteria: [
                'All tests pass',
                'Test coverage >80%'
            ]
        });

        return subtasks;
    }

    /**
     * Resolve dependencies between tasks
     * @param {Array<Object>} tasks - Generated tasks
     * @returns {Array<Object>} Tasks with resolved dependencies
     */
    resolve_task_dependencies(tasks) {
        tasks.forEach((task, index) => {
            const task_keywords = this.extract_keywords(task.title);
            
            tasks.forEach((potential_dependency, dep_index) => {
                if (dep_index >= index) return; // Only depend on earlier tasks

                const dep_keywords = this.extract_keywords(potential_dependency.title);
                
                if (this.has_dependency_relationship(task_keywords, dep_keywords)) {
                    task.dependencies.push(potential_dependency.id);
                }
            });
        });

        return tasks;
    }

    /**
     * Extract keywords from task title for dependency analysis
     * @param {string} title - Task title
     * @returns {Array<string>} Keywords
     */
    extract_keywords(title) {
        const lower_title = title.toLowerCase();
        const keywords = [];

        Object.keys(this.dependency_patterns).forEach(pattern => {
            if (lower_title.includes(pattern)) {
                keywords.push(pattern);
            }
        });

        return keywords;
    }

    /**
     * Check if there's a dependency relationship between task keywords
     * @param {Array<string>} task_keywords - Current task keywords
     * @param {Array<string>} dep_keywords - Potential dependency keywords
     * @returns {boolean} Whether dependency exists
     */
    has_dependency_relationship(task_keywords, dep_keywords) {
        return task_keywords.some(keyword => {
            const dependencies = this.dependency_patterns[keyword] || [];
            return dependencies.some(dep => dep_keywords.includes(dep));
        });
    }

    /**
     * Enhance tasks with additional context from PRD
     * @param {Array<Object>} tasks - Generated tasks
     * @param {Object} prd_data - PRD data
     * @returns {Array<Object>} Enhanced tasks
     */
    enhance_tasks_with_context(tasks, prd_data) {
        return tasks.map(task => {
            // Add success criteria context
            const relevant_criteria = prd_data.success_criteria.filter(criteria => 
                task.title.toLowerCase().includes(criteria.toLowerCase().split(' ')[0])
            );

            if (relevant_criteria.length > 0) {
                task.success_criteria = relevant_criteria;
            }

            // Add constraint context
            const relevant_constraints = prd_data.constraints.filter(constraint =>
                task.title.toLowerCase().includes(constraint.toLowerCase().split(' ')[0])
            );

            if (relevant_constraints.length > 0) {
                task.constraints = relevant_constraints;
            }

            // Adjust complexity based on overall project complexity
            if (prd_data.complexity_assessment.level === 'expert' && task.complexity_level === 'basic') {
                task.complexity_level = 'intermediate';
            }

            return task;
        });
    }

    /**
     * Calculate total estimated hours for all tasks
     * @param {Array<Object>} tasks - Tasks with hour estimates
     * @returns {number} Total estimated hours
     */
    calculate_total_hours(tasks) {
        return tasks.reduce((total, task) => total + task.estimated_hours, 0);
    }

    /**
     * Generate execution plan for tasks
     * @param {Array<Object>} tasks - Generated tasks
     * @returns {Object} Execution plan with phases and timeline
     */
    generate_execution_plan(tasks) {
        const critical_tasks = tasks.filter(task => task.priority === 'critical');
        const high_tasks = tasks.filter(task => task.priority === 'high');
        const medium_tasks = tasks.filter(task => task.priority === 'medium');

        return {
            phases: [
                {
                    name: 'Foundation Phase',
                    tasks: critical_tasks.map(task => task.id),
                    estimated_duration: `${Math.ceil(critical_tasks.reduce((sum, task) => sum + task.estimated_hours, 0) / 40)} weeks`
                },
                {
                    name: 'Development Phase',
                    tasks: high_tasks.map(task => task.id),
                    estimated_duration: `${Math.ceil(high_tasks.reduce((sum, task) => sum + task.estimated_hours, 0) / 40)} weeks`
                },
                {
                    name: 'Enhancement Phase',
                    tasks: medium_tasks.map(task => task.id),
                    estimated_duration: `${Math.ceil(medium_tasks.reduce((sum, task) => sum + task.estimated_hours, 0) / 40)} weeks`
                }
            ],
            parallel_opportunities: this.identify_parallel_tasks(tasks),
            critical_path: this.calculate_critical_path(tasks)
        };
    }

    /**
     * Identify tasks that can be executed in parallel
     * @param {Array<Object>} tasks - All tasks
     * @returns {Array<Array<string>>} Groups of parallel task IDs
     */
    identify_parallel_tasks(tasks) {
        const parallel_groups = [];
        const processed_tasks = new Set();

        tasks.forEach(task => {
            if (processed_tasks.has(task.id)) return;

            const parallel_group = [task.id];
            processed_tasks.add(task.id);

            // Find tasks with no dependencies on this task
            tasks.forEach(other_task => {
                if (processed_tasks.has(other_task.id)) return;
                if (!other_task.dependencies.includes(task.id) && 
                    !task.dependencies.includes(other_task.id)) {
                    parallel_group.push(other_task.id);
                    processed_tasks.add(other_task.id);
                }
            });

            if (parallel_group.length > 1) {
                parallel_groups.push(parallel_group);
            }
        });

        return parallel_groups;
    }

    /**
     * Calculate critical path through tasks
     * @param {Array<Object>} tasks - All tasks
     * @returns {Array<string>} Task IDs in critical path order
     */
    calculate_critical_path(tasks) {
        // Simple critical path: longest dependency chain
        let longest_path = [];
        let max_duration = 0;

        tasks.forEach(task => {
            const path = this.get_dependency_path(task, tasks);
            const duration = path.reduce((sum, task_id) => {
                const task_obj = tasks.find(t => t.id === task_id);
                return sum + (task_obj ? task_obj.estimated_hours : 0);
            }, 0);

            if (duration > max_duration) {
                max_duration = duration;
                longest_path = path;
            }
        });

        return longest_path;
    }

    /**
     * Get dependency path for a task
     * @param {Object} task - Task to trace
     * @param {Array<Object>} all_tasks - All tasks
     * @returns {Array<string>} Dependency path
     */
    get_dependency_path(task, all_tasks) {
        const path = [task.id];
        
        task.dependencies.forEach(dep_id => {
            const dep_task = all_tasks.find(t => t.id === dep_id);
            if (dep_task) {
                const dep_path = this.get_dependency_path(dep_task, all_tasks);
                path.unshift(...dep_path);
            }
        });

        return [...new Set(path)]; // Remove duplicates
    }
}

module.exports = TaskGenerator;
