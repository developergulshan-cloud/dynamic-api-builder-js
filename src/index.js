/**
 * DAB-API Module
 * Low-Code API Platform - Configuration-driven REST API generator
 */

const DabRouter = require('./router/dynamicRouter');
const DabValidator = require('./engine/validator');
const DabExecutor = require('./engine/executor');
const DabQueryBuilder = require('./db/queryBuilder');
const DabHooks = require('./engine/hooks');
const DabResponse = require('./engine/response');
const errorHandler = require('./utills/error');

/**
 * Initialize DAB-API with configuration
 * @param {Object} config - DAB configuration
 * @param {Array} config.apis - Array of API definitions
 * @param {Object} config.database - Database configuration
 * @param {Object} options - Additional options
 * @returns {Object} Express router and utilities
 */
function dabApi(config, options = {}) {
    if (!config || !config.apis) {
        throw new Error('DAB-API: Configuration with apis array is required');
    }

    // Initialize database connection
    if (config.database) {
        DabQueryBuilder.configure(config);
    }

    // Create router with config
    const router = DabRouter.createRouter(config.apis, options);

    // Attach centralized error handler to the router so errors from dynamic
    // routes are normalized in one place. Server-level code should not
    // re-register the same handler to avoid duplicate responses.
    router.use(errorHandler);

    return {
        router,
        validator: DabValidator,
        executor: DabExecutor,
        queryBuilder: DabQueryBuilder,
        hooks: DabHooks,
        response: DabResponse
    };
}

// Export main function
module.exports = dabApi;

// Export individual components for advanced usage
module.exports.DabRouter = DabRouter;
module.exports.DabValidator = DabValidator;
module.exports.DabExecutor = DabExecutor;
module.exports.DabQueryBuilder = DabQueryBuilder;
module.exports.DabHooks = DabHooks;
module.exports.DabResponse = DabResponse;