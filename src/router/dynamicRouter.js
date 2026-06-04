/**
 * LCAP Router Module
 * Dynamically generates Express routes from configuration
 */

const express = require('express');
const validator = require('../engine/validator');
const executor = require('../engine/executor');

class LcapRouter {
    /**
     * Create Express router from API configuration
     * @param {Array} apis - Array of API definitions
     * @param {Object} options - Router options
     * @returns {express.Router} Configured Express router
     */
    static createRouter(apis, options = {}) {
        const router = express.Router();

        if (!Array.isArray(apis)) {
            throw new Error('LCAP Router: apis must be an array');
        }

        console.log(`✅ LCAP: Loading ${apis.length} API definitions`);

        // Generate routes from configuration
        apis.forEach(api => {
            this._registerRoute(router, api, options);
        });

        return router;
    }

    /**
     * Register a single route
     * @private
     */
    static _registerRoute(router, api, options) {
        const { endpoint, method, type } = api;

        if (!endpoint || !method || !type) {
            console.warn('⚠️  LCAP: Invalid API definition, skipping:', api.id || 'unknown');
            return;
        }

        console.log(`📌 LCAP: Registering ${method} ${endpoint}`);

        // Create route handler
        const handler = async (req, res, next) => {
            try {
                // Custom middleware if provided
                if (options.middleware) {
                    await this._runMiddleware(options.middleware, req, res);
                }

                // Validate request
                const validationErrors = validator.validate(req, api);
                if (validationErrors.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: 'Validation failed',
                            code: 400,
                            details: validationErrors
                        },
                        timestamp: new Date().toISOString()
                    });
                }

                // Execute API logic based on type
                let result;
                switch (type) {
                    case 'CRUD':
                        result = await executor.executeCRUD(api, req);
                        break;
                    case 'TRANSACTION':
                        result = await executor.executeTransaction(api, req);
                        break;
                    case 'FUNCTION':
                        result = await executor.executeFunction(api, req);
                        break;
                    case 'CALL_FUNCTION':
                        result = await executor.executeCallFunction(api, req);
                        break;
                    case 'CALL_PROCEDURE':
                        result = await executor.executeCallProcedure(api, req);
                        break;
                    default:
                        throw new Error(`Unknown API type: ${type}`);
                }

                // Send response
                res.status(result.status || 200).json({
                    success: true,
                    data: result.data,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                next(error);
            }
        };

        // Register route based on HTTP method
        const methodLower = method.toLowerCase();
        if (router[methodLower]) {
            router[methodLower](endpoint, handler);
        } else {
            console.warn(`⚠️  LCAP: Unknown HTTP method: ${method} for ${endpoint}`);
        }
    }

    /**
     * Run custom middleware
     * @private
     */
    static async _runMiddleware(middleware, req, res) {
        if (typeof middleware === 'function') {
            await new Promise((resolve, reject) => {
                middleware(req, res, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } else if (Array.isArray(middleware)) {
            for (const mw of middleware) {
                await this._runMiddleware(mw, req, res);
            }
        }
    }
}

module.exports = LcapRouter;