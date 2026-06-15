/**
 * LCAP-API Module
 * Low-Code API Platform - Configuration-driven REST API generator
 */

const LcapRouter = require('./router/dynamicRouter');
const LcapValidator = require('./engine/validator');
const LcapExecutor = require('./engine/executor');
const LcapQueryBuilder = require('./db/queryBuilder');
const LcapHooks = require('./engine/hooks');
const LcapResponse = require('./engine/response');
const errorHandler = require('./utills/error');

/**
 * Initialize LCAP-API with configuration
 * @param {Object} config - LCAP configuration
 * @param {Array} config.apis - Array of API definitions
 * @param {Object} config.database - Database configuration
 * @param {Object} options - Additional options
 * @returns {Object} Express router and utilities
 */
function lcapApi(config, options = {}) {
    if (!config || !config.apis) {
        throw new Error('LCAP-API: Configuration with apis array is required');
    }

    // Initialize database connection
    if (config.database) {
        LcapQueryBuilder.configure(config);
    }

    // Create router with config
    const router = LcapRouter.createRouter(config.apis, options);

    // Attach centralized error handler to the router so errors from dynamic
    // routes are normalized in one place. Server-level code should not
    // re-register the same handler to avoid duplicate responses.
    router.use(errorHandler);

    return {
        router,
        validator: LcapValidator,
        executor: LcapExecutor,
        queryBuilder: LcapQueryBuilder,
        hooks: LcapHooks,
        response: LcapResponse
    };
}

// Export main function
module.exports = lcapApi;

// Export individual components for advanced usage
module.exports.LcapRouter = LcapRouter;
module.exports.LcapValidator = LcapValidator;
module.exports.LcapExecutor = LcapExecutor;
module.exports.LcapQueryBuilder = LcapQueryBuilder;
module.exports.LcapHooks = LcapHooks;
module.exports.LcapResponse = LcapResponse;