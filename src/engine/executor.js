/**
 * LCAP Executor Module
 * Executes different types of API operations
 */

const queryBuilder = require('../db/queryBuilder');
const hooks = require('../engine/hooks');

class LcapExecutor {
    /**
     * Execute CRUD operation
     */
    static async executeCRUD(apiConfig, req) {
        const { operation, table, columns, filters, pagination, hooks: apiHooks, joins, filterConfig } = apiConfig;

        try {
            // Execute before hook
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            let result;

            switch (operation) {
                case 'CREATE':
                    result = await this._handleCreate(table, columns, req.body);
                    break;
                case 'READ':
                    result = await this._handleRead(table, filters, pagination, req.query, joins, columns, filterConfig);
                    break;
                case 'UPDATE':
                    result = await this._handleUpdate(table, columns, req.params, req.body);
                    break;
                case 'DELETE':
                    result = await this._handleDelete(table, req.params);
                    break;
                default:
                    throw new Error(`Unknown CRUD operation: ${operation}`);
            }

            // Execute after hook
            if (apiHooks && apiHooks.after) {
                await hooks.execute(apiHooks.after, req, result);
            }

            return { status: 200, data: result };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Execute transaction (multiple operations)
     */
    static async executeTransaction(apiConfig, req) {
        const { steps } = apiConfig;
        const results = {};

        try {
            await queryBuilder.beginTransaction();

            for (const step of steps) {
                let stepResult;

                if (step.type === 'CRUD') {
                    stepResult = await this._executeCRUDStep(step, req, results);
                } else if (step.type === 'FUNCTION') {
                    stepResult = await hooks.execute(step.handler, req, results);
                }

                if (step.saveAs) {
                    results[step.saveAs] = stepResult;
                }
            }

            await queryBuilder.commit();
            return { status: 200, data: results };
        } catch (error) {
            await queryBuilder.rollback();
            throw error;
        }
    }

    /**
     * Execute a MySQL stored FUNCTION via CALL_FUNCTION API type
     *
     * API config shape:
     * {
     *   type: "CALL_FUNCTION",
     *   function: "get_discount",          // DB function name
     *   params: [                          // ordered parameter definitions
     *     { name: "user_id",  source: "body"   },
     *     { name: "amount",   source: "query"  },
     *     { name: "code",     source: "params" },
     *     { name: "currency", source: "static", value: "USD" }
     *   ]
     * }
     */
    static async executeCallFunction(apiConfig, req) {
        const { function: funcName, params: paramDefs = [], hooks: apiHooks } = apiConfig;

        if (!funcName) {
            throw new Error('LCAP CALL_FUNCTION: "function" name is required in API config');
        }

        try {
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            const paramValues = this._resolveParams(paramDefs, req);
            const result = await queryBuilder.callFunction(funcName, paramValues);

            const data = { result };

            if (apiHooks && apiHooks.after) {
                await hooks.execute(apiHooks.after, req, data);
            }

            return { status: 200, data };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Execute a MySQL stored PROCEDURE via CALL_PROCEDURE API type
     *
     * API config shape:
     * {
     *   type: "CALL_PROCEDURE",
     *   procedure: "transfer_funds",        // DB procedure name
     *   params: [
     *     { name: "from_account", source: "body"   },
     *     { name: "to_account",   source: "body"   },
     *     { name: "amount",       source: "body"   },
     *     { name: "currency",     source: "static", value: "INR" }
     *   ]
     * }
     */
    static async executeCallProcedure(apiConfig, req) {
        const { procedure: procName, params: paramDefs = [], hooks: apiHooks } = apiConfig;

        if (!procName) {
            throw new Error('LCAP CALL_PROCEDURE: "procedure" name is required in API config');
        }

        try {
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            const paramValues = this._resolveParams(paramDefs, req);
            const resultSets = await queryBuilder.callProcedure(procName, paramValues);

            // Flatten single-result-set procedures for convenience
            const data = resultSets.length === 1 ? resultSets[0] : resultSets;

            if (apiHooks && apiHooks.after) {
                await hooks.execute(apiHooks.after, req, data);
            }

            return { status: 200, data };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Resolve ordered parameter values from request sources
     *
     * Each param definition:
     * { name: string, source: "body"|"query"|"params"|"headers"|"static", value?: any }
     *
     * @private
     */
    static _resolveParams(paramDefs, req) {
        return paramDefs.map(def => {
            switch (def.source) {
                case 'body':
                    return req.body?.[def.name] ?? null;
                case 'query':
                    return req.query?.[def.name] ?? null;
                case 'params':
                    return req.params?.[def.name] ?? null;
                case 'headers':
                    return req.headers?.[def.name.toLowerCase()] ?? null;
                case 'static':
                    return def.value ?? null;
                default:
                    throw new Error(`LCAP: Unknown param source "${def.source}" for param "${def.name}"`);
            }
        });
    }

    /**
     * Execute custom function
     */
    static async executeFunction(apiConfig, req) {
        const { handler } = apiConfig;

        try {
            const result = await hooks.execute(handler, req);
            return { status: 200, data: result };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Handle CREATE operation
     * @private
     */
    static async _handleCreate(table, columns, data) {
        const insertData = {};
        columns.forEach(col => {
            if (data[col] !== undefined) {
                insertData[col] = data[col];
            }
        });

        const query = queryBuilder.insert(table, insertData);
        const result = await queryBuilder.execute(query.sql, query.params);
        return { id: result.insertId, ...insertData };
    }

    /**
     * Handle READ operation
     * @private
     */
    static async _handleRead(table, filters, pagination, queryParams, joins, columns, filterConfig) {
        let query = queryBuilder.select(table, columns || ['*']);

        // Apply joins if configured
        if (joins && Array.isArray(joins)) {
            joins.forEach(join => {
                const joinMethod = join.type === 'LEFT' ? 'leftJoin' :
                    join.type === 'RIGHT' ? 'rightJoin' : 'join';
                query = queryBuilder[joinMethod](query, join.table, join.condition);
            });
        }

        // Apply filters with advanced operators
        if (filters && queryParams) {
            filters.forEach(filter => {
                // Check if filter has configuration for operators
                const filterDef = filterConfig && filterConfig[filter];
                const operator = filterDef?.operator || '=';

                if (queryParams[filter]) {
                    const value = queryParams[filter];

                    // Handle multiple values (OR condition)
                    if (value.includes(',') && operator === '=') {
                        query = queryBuilder.whereIn(query, filter, value.split(','));
                    }
                    // Handle LIKE operator
                    else if (operator === 'LIKE' || operator === 'like') {
                        query = queryBuilder.where(query, filter, `%${value}%`, 'LIKE');
                    }
                    // Handle other operators
                    else {
                        query = queryBuilder.where(query, filter, value, operator);
                    }
                }
            });
        }

        // Apply OR conditions if configured
        if (queryParams._or && filterConfig?.orFields) {
            const orValue = queryParams._or;
            query = queryBuilder.whereOr(query, filterConfig.orFields, orValue);
        }

        // Apply pagination
        if (pagination && queryParams.page) {
            const page = parseInt(queryParams.page) || 1;
            const limit = parseInt(queryParams.limit) || 10;
            const offset = (page - 1) * limit;
            query = queryBuilder.paginate(query, limit, offset);
        }

        const builtQuery = queryBuilder.build(query);
        const results = await queryBuilder.execute(builtQuery.sql, builtQuery.params);
        return results;
    }

    /**
     * Handle UPDATE operation
     * @private
     */
    static async _handleUpdate(table, columns, params, data) {
        const updateData = {};
        columns.forEach(col => {
            if (data[col] !== undefined) {
                updateData[col] = data[col];
            }
        });

        const query = queryBuilder.update(table, updateData, params.id);
        await queryBuilder.execute(query.sql, query.params);
        return { id: params.id, ...updateData };
    }

    /**
     * Handle DELETE operation
     * @private
     */
    static async _handleDelete(table, params) {
        const query = queryBuilder.delete(table, params.id);
        await queryBuilder.execute(query.sql, query.params);
        return { id: params.id, deleted: true };
    }

    /**
     * Execute CRUD step in transaction
     * @private
     */
    static async _executeCRUDStep(step, req, previousResults) {
        const { operation, table, columns, map } = step;
        let data = { ...req.body };

        // Map data from previous results
        if (map) {
            for (const [key, value] of Object.entries(map)) {
                if (value.startsWith('$')) {
                    const path = value.substring(1).split('.');
                    let resolvedValue = previousResults;
                    for (const part of path) {
                        resolvedValue = resolvedValue[part];
                    }
                    data[key] = resolvedValue;
                }
            }
        }

        switch (operation) {
            case 'CREATE':
                return await this._handleCreate(table, columns, data);
            case 'UPDATE':
                return await this._handleUpdate(table, columns, req.params, data);
            default:
                throw new Error(`Unknown operation in transaction: ${operation}`);
        }
    }
}

module.exports = LcapExecutor;