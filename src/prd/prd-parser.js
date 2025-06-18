/**
 * PRD Parser for Task-Directed Workflow Integration
 * 
 * Parses Project Requirements Documents (PRD) from markdown format
 * and extracts structured data for task generation and orchestration.
 */

const fs = require('fs');
const path = require('path');

/**
 * PRD Parser class for extracting structured data from markdown PRDs
 */
class PRDParser {
    constructor() {
        this.required_sections = [
            'Project Name',
            'Vision', 
            'Technical Requirements',
            'Success Criteria'
        ];
    }

    /**
     * Parse PRD markdown file into structured data
     * @param {string} prd_file_path - Path to PRD markdown file
     * @returns {Object} Parsed PRD data following ProjectRequirementsDocument interface
     */
    parse_prd_file(prd_file_path) {
        if (!fs.existsSync(prd_file_path)) {
            throw new Error(`PRD file not found: ${prd_file_path}`);
        }

        const prd_content = fs.readFileSync(prd_file_path, 'utf8');
        return this.parse_prd_content(prd_content);
    }

    /**
     * Parse PRD content string into structured data
     * @param {string} prd_content - PRD markdown content
     * @returns {Object} Parsed PRD data
     */
    parse_prd_content(prd_content) {
        const parsed_data = {
            project_name: this.extract_project_name(prd_content),
            vision: this.extract_vision(prd_content),
            technical_requirements: this.extract_technical_requirements(prd_content),
            success_criteria: this.extract_success_criteria(prd_content),
            dependencies: this.extract_dependencies(prd_content),
            constraints: this.extract_constraints(prd_content),
            complexity_assessment: this.extract_complexity_assessment(prd_content),
            estimated_timeline: this.extract_estimated_timeline(prd_content),
            risk_factors: this.extract_risk_factors(prd_content),
            stakeholders: this.extract_stakeholders(prd_content)
        };

        this.validate_required_sections(parsed_data);
        return parsed_data;
    }

    /**
     * Extract project name from PRD content
     * @param {string} content - PRD content
     * @returns {string} Project name
     */
    extract_project_name(content) {
        const project_name_match = content.match(/(?:^|\n)#+ Project Name\s*\n([^\n]+)/);
        return project_name_match ? project_name_match[1].trim() : 'Unknown Project';
    }

    /**
     * Extract vision statement from PRD content
     * @param {string} content - PRD content
     * @returns {string} Vision statement
     */
    extract_vision(content) {
        const vision_match = content.match(/(?:^|\n)#+ Vision\s*\n(.*?)(?=#|\n## |$)/s);
        return vision_match ? vision_match[1].trim() : '';
    }

    /**
     * Extract technical requirements from PRD content
     * @param {string} content - PRD content
     * @returns {Array<string>} Technical requirements
     */
    extract_technical_requirements(content) {
        const tech_requirements_section = content.match(/(?:^|\n)#+ Technical Requirements\s*\n(.*?)(?=#|\n## |$)/s);
        if (!tech_requirements_section) return [];

        const requirements = tech_requirements_section[1].match(/- (.+)/g) || [];
        return requirements.map(req => req.replace(/^- /, '').trim()).filter(req => req.length > 0);
    }

    /**
     * Extract success criteria from PRD content
     * @param {string} content - PRD content
     * @returns {Array<string>} Success criteria
     */
    extract_success_criteria(content) {
        const success_criteria_section = content.match(/(?:^|\n)#+ Success Criteria\s*\n(.*?)(?=#|\n## |$)/s);
        if (!success_criteria_section) return [];

        const criteria = success_criteria_section[1].match(/- (.+)/g) || [];
        return criteria.map(criterion => criterion.replace(/^- /, '').trim()).filter(criterion => criterion.length > 0);
    }

    /**
     * Extract dependencies from PRD content
     * @param {string} content - PRD content
     * @returns {Array<string>} Dependencies
     */
    extract_dependencies(content) {
        const dependencies_section = content.match(/### Dependencies\s*\n(.*?)(?=###|\n## |$)/s);
        if (!dependencies_section) return [];

        const dependencies = dependencies_section[1].match(/- \[ \] (.+)/g) || [];
        return dependencies.map(dep => dep.replace(/- \[ \] /, '').trim());
    }

    /**
     * Extract constraints from PRD content
     * @param {string} content - PRD content
     * @returns {Array<string>} Constraints
     */
    extract_constraints(content) {
        const constraints_section = content.match(/### Constraints\s*\n(.*?)(?=###|\n## |$)/s);
        if (!constraints_section) return [];

        const constraints = constraints_section[1].match(/- \[ \] (.+)/g) || [];
        return constraints.map(constraint => constraint.replace(/- \[ \] /, '').trim());
    }

    /**
     * Extract complexity assessment from PRD content
     * @param {string} content - PRD content
     * @returns {Object} Complexity assessment with level and justification
     */
    extract_complexity_assessment(content) {
        const complexity_section = content.match(/### Complexity Assessment\s*\n(.*?)(?=###|\n## |$)/s);
        if (!complexity_section) return { level: 'intermediate', justification: '' };

        const level_match = complexity_section[1].match(/\*\*Level\*\*:\s*(.+)/);
        const justification_match = complexity_section[1].match(/\*\*Justification\*\*:\s*(.*?)(?=\*\*|$)/s);

        return {
            level: level_match ? level_match[1].trim().toLowerCase() : 'intermediate',
            justification: justification_match ? justification_match[1].trim() : ''
        };
    }

    /**
     * Extract estimated timeline from PRD content
     * @param {string} content - PRD content
     * @returns {Object} Timeline with duration and breakdown
     */
    extract_estimated_timeline(content) {
        const timeline_section = content.match(/### Estimated Timeline\s*\n(.*?)(?=###|\n## |$)/s);
        if (!timeline_section) return { duration: '', breakdown: [] };

        const duration_match = timeline_section[1].match(/\*\*Duration\*\*:\s*(.+)/);
        const breakdown_match = timeline_section[1].match(/\*\*Breakdown\*\*:\s*(.*?)(?=\*\*|$)/s);

        let breakdown = [];
        if (breakdown_match) {
            breakdown = breakdown_match[1].match(/- (.+)/g) || [];
            breakdown = breakdown.map(item => item.replace(/- /, '').trim());
        }

        return {
            duration: duration_match ? duration_match[1].trim() : '',
            breakdown: breakdown
        };
    }

    /**
     * Extract risk factors from PRD content
     * @param {string} content - PRD content
     * @returns {Array<Object>} Risk factors with type, description, impact, and mitigation
     */
    extract_risk_factors(content) {
        const risk_section = content.match(/### Risk Factors\s*\n(.*?)(?=###|\n## |$)/s);
        if (!risk_section) return [];

        const risks = [];
        const risk_blocks = risk_section[1].split(/#### /);

        risk_blocks.forEach(block => {
            if (!block.trim()) return;

            const lines = block.split('\n').filter(line => line.trim());
            if (lines.length === 0) return;

            const risk_type = lines[0].replace('Risks', '').trim();
            const risk_items = lines.slice(1);

            risk_items.forEach(item => {
                const risk_match = item.match(/- \*\*Risk\*\*:\s*(.+)/);
                if (risk_match) {
                    const risk = {
                        type: risk_type,
                        description: risk_match[1].trim(),
                        impact: '',
                        mitigation: ''
                    };

                    // Extract impact and mitigation from subsequent lines
                    const item_index = risk_items.indexOf(item);
                    if (item_index < risk_items.length - 2) {
                        const impact_match = risk_items[item_index + 1].match(/- \*\*Impact\*\*:\s*(.+)/);
                        const mitigation_match = risk_items[item_index + 2].match(/- \*\*Mitigation\*\*:\s*(.+)/);

                        if (impact_match) risk.impact = impact_match[1].trim();
                        if (mitigation_match) risk.mitigation = mitigation_match[1].trim();
                    }

                    risks.push(risk);
                }
            });
        });

        return risks;
    }

    /**
     * Extract stakeholders from PRD content
     * @param {string} content - PRD content
     * @returns {Array<string>} Stakeholders
     */
    extract_stakeholders(content) {
        const stakeholders_section = content.match(/### Stakeholders\s*\n(.*?)(?=###|\n## |$)/s);
        if (!stakeholders_section) return [];

        const stakeholders = stakeholders_section[1].match(/- \*\*(.+?)\*\*:/g) || [];
        return stakeholders.map(stakeholder => stakeholder.replace(/- \*\*(.+?)\*\*:/, '$1').trim());
    }

    /**
     * Validate that all required sections are present
     * @param {Object} parsed_data - Parsed PRD data
     * @throws {Error} If required sections are missing
     */
    validate_required_sections(parsed_data) {
        const missing_sections = [];

        if (!parsed_data.project_name || parsed_data.project_name === 'Unknown Project') {
            missing_sections.push('Project Name');
        }
        if (!parsed_data.vision) {
            missing_sections.push('Vision');
        }
        if (!parsed_data.technical_requirements || parsed_data.technical_requirements.length === 0) {
            missing_sections.push('Technical Requirements');
        }
        if (!parsed_data.success_criteria || parsed_data.success_criteria.length === 0) {
            missing_sections.push('Success Criteria');
        }

        if (missing_sections.length > 0) {
            throw new Error(`PRD validation failed. Missing required sections: ${missing_sections.join(', ')}`);
        }
    }

    /**
     * Generate PRD summary for logging and reporting
     * @param {Object} parsed_data - Parsed PRD data
     * @returns {Object} PRD summary
     */
    generate_summary(parsed_data) {
        return {
            project_name: parsed_data.project_name,
            complexity_level: parsed_data.complexity_assessment.level,
            estimated_duration: parsed_data.estimated_timeline.duration,
            total_requirements: parsed_data.technical_requirements.length,
            total_success_criteria: parsed_data.success_criteria.length,
            dependencies_count: parsed_data.dependencies.length,
            constraints_count: parsed_data.constraints.length,
            risks_count: parsed_data.risk_factors.length,
            stakeholders_count: parsed_data.stakeholders.length
        };
    }
}

module.exports = PRDParser;
