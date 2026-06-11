/**
 * LCAP Validator Module
 * Request validation based on API configuration
 */

class LcapValidator {
    /**
     * Validate request based on API config
     * @param {Object} req - Express request object
     * @param {Object} apiConfig - API configuration
     * @returns {Array} Array of validation errors
     */
    static validate(req, apiConfig) {
        const errors = [];

        if (!apiConfig.validation) {
            return errors;
        }

        const data = req.method === 'GET' ? req.query : req.body;

        for (const [field, rules] of Object.entries(apiConfig.validation)) {
            const value = data?.[field];
            const ruleList = rules.split('|');

            for (const rule of ruleList) {
                const error = this._validateRule(field, value, rule);
                if (error) {
                    errors.push(error);
                    break;
                }
            }
        }

        return errors;
    }

    /**
     * Validate a single rule
     * @private
     */
    static _validateRule(field, value, rule) {
        // Required check
        if (rule === 'required') {
            if (value === undefined || value === null || value === '') {
                return { field, message: `${field} is required` };
            }
        }

        // Type checks
        if (rule === 'string') {
            if (typeof value !== 'string') {
                return { field, message: `${field} must be a string` };
            }
        }

        if (rule === 'number') {
            if (typeof value !== 'number' && isNaN(Number(value))) {
                return { field, message: `${field} must be a number` };
            }
        }

        if (rule === 'boolean') {
            if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
                return { field, message: `${field} must be a boolean` };
            }
        }

        if (rule === 'array') {
            if (!Array.isArray(value)) {
                return { field, message: `${field} must be an array` };
            }
        }

        // Email validation
        if (rule === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                return { field, message: `${field} must be a valid email` };
            }
        }

        // URL validation
        if (rule === 'url') {
            try {
                new URL(value);
            } catch {
                return { field, message: `${field} must be a valid URL` };
            }
        }

        // Length checks
        if (rule.startsWith('min:')) {
            const minLength = parseInt(rule.split(':')[1]);
            if (value && value.length < minLength) {
                return { field, message: `${field} must be at least ${minLength} characters` };
            }
        }

        if (rule.startsWith('max:')) {
            const maxLength = parseInt(rule.split(':')[1]);
            if (value && value.length > maxLength) {
                return { field, message: `${field} must not exceed ${maxLength} characters` };
            }
        }

        // Numeric value checks
        if (rule.startsWith('minValue:')) {
            const minValue = parseFloat(rule.split(':')[1]);
            if (parseFloat(value) < minValue) {
                return { field, message: `${field} must be at least ${minValue}` };
            }
        }

        if (rule.startsWith('maxValue:')) {
            const maxValue = parseFloat(rule.split(':')[1]);
            if (parseFloat(value) > maxValue) {
                return { field, message: `${field} must not exceed ${maxValue}` };
            }
        }

        // Pattern matching
        if (rule.startsWith('pattern:')) {
            const pattern = rule.split(':')[1];
            const regex = new RegExp(pattern);
            if (!regex.test(value)) {
                return { field, message: `${field} format is invalid` };
            }
        }

        // Enum check
        if (rule.startsWith('in:')) {
            const allowedValues = rule.split(':')[1].split(',');
            if (!allowedValues.includes(String(value))) {
                return { field, message: `${field} must be one of: ${allowedValues.join(', ')}` };
            }
        }

        return null;
    }

    /**
     * Add custom validation rule
     * @param {String} name - Rule name
     * @param {Function} validator - Validator function
     */
    static addRule(name, validator) {
        this.customRules = this.customRules || {};
        this.customRules[name] = validator;
    }
}

module.exports = LcapValidator;