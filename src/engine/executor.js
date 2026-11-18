/**
 * DAB Executor Module
 * Executes different types of API operations
 */

const queryBuilder = require('../db/queryBuilder');
const hooks = require('../engine/hooks');

class DabExecutor {
    /**
     * Execute CRUD operation
     */
    static async executeCRUD(apiConfig, req) {
        const { operation, table, columns, filters, pagination, hooks: apiHooks, joins, filterConfig } = apiConfig;
        const database = queryBuilder.forDatabase(apiConfig.database);

        try {
            // Execute before hook
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            let result;

            if (apiConfig.customQuery !== undefined) {
                result = await this._executeCustomQuery(
                    apiConfig.customQuery,
                    database,
                    undefined,
                    pagination,
                    req.query,
                    filters,
                    filterConfig,
                    operation === 'CREATE' || operation === 'UPDATE' ? req.body : {
                        ...req.query,
                        ...req.params
                    }
                );
            } else {
                switch (operation) {
                    case 'CREATE':
                        result = await this._handleCreate(table, columns, req.body, database);
                        break;
                    case 'READ':
                        result = await this._handleRead(table, filters, pagination, req.query, joins, columns, filterConfig, database);
                        break;
                    case 'UPDATE':
                        result = await this._handleUpdate(table, columns, req.params, req.body, database);
                        // If update did not affect any row, return 204 No Content
                        if (result === null) {
                            return { status: 204, data: 'Data not found !' };
                        }
                        break;
                    case 'DELETE':
                        result = await this._handleDelete(table, req.params, database);
                        break;
                    default:
                        throw new Error(`Unknown CRUD operation: ${operation}`);
                }
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
        const { steps = [] } = apiConfig;
        const results = {};
        const database = queryBuilder.forDatabase(apiConfig.database);
        let connection;

        try {
            connection = await database.beginTransaction();

            if (apiConfig.customQuery !== undefined) {
                const result = await this._executeCustomQuery(
                    apiConfig.customQuery,
                    database,
                    connection,
                    apiConfig.pagination,
                    req.query,
                    apiConfig.filters,
                    apiConfig.filterConfig,
                    { ...req.query, ...req.params }
                );
                await database.commit(connection);
                connection = null;
                return { status: 200, data: result };
            }

            for (const step of steps) {
                let stepResult;

                if (step.type === 'CRUD') {
                    stepResult = await this._executeCRUDStep(step, req, results, database, connection);
                } else if (step.type === 'FUNCTION') {
                    stepResult = await hooks.execute(step.handler, req, results);
                }

                if (step.saveAs) {
                    results[step.saveAs] = stepResult;
                }
            }

            await database.commit(connection);
            connection = null;
            return { status: 200, data: results };
        } catch (error) {
            if (connection) {
                await database.rollback(connection);
            }
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
        const database = queryBuilder.forDatabase(apiConfig.database);

        if (!funcName) {
            throw new Error('DAB CALL_FUNCTION: "function" name is required in API config');
        }

        try {
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            const paramValues = this._resolveParams(paramDefs, req);
            const result = await database.callFunction(funcName, paramValues);

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
        const database = queryBuilder.forDatabase(apiConfig.database);

        if (!procName) {
            throw new Error('DAB CALL_PROCEDURE: "procedure" name is required in API config');
        }

        try {
            if (apiHooks && apiHooks.before) {
                await hooks.execute(apiHooks.before, req);
            }

            const paramValues = this._resolveParams(paramDefs, req);
            const resultSets = await database.callProcedure(procName, paramValues);

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
                    throw new Error(`DAB: Unknown param source "${def.source}" for param "${def.name}"`);
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
     * Execute configured SQL directly. Pagination wraps SELECT queries so it
     * can be applied without parsing or rewriting the configured SQL.
     * @private
     */
    static async _executeCustomQuery(
        customQuery,
        database,
        connection,
        pagination,
        queryParams,
        filters,
        filterConfig,
        placeholderParams = queryParams
    ) {
        if (typeof customQuery !== 'string' || !customQuery.trim()) {
            throw new Error('DAB: customQuery must be a non-empty SQL string');
        }

        const preparedQuery = this._prepareCustomQuery(customQuery, database);
        let queryParamsForCustomQuery = [];
        if (preparedQuery.placeholderCount > 0) {
            if (!Array.isArray(filters) || filters.length !== preparedQuery.placeholderCount) {
                throw new Error(
                    `DAB: customQuery has ${preparedQuery.placeholderCount} placeholders; ` +
                    'provide one filter name per placeholder in binding order'
                );
            }

            queryParamsForCustomQuery = filters.map(filter => placeholderParams?.[filter]);
            const missingParamIndex = queryParamsForCustomQuery.findIndex(value => value === undefined);
            if (missingParamIndex !== -1) {
                throw new Error(
                    `DAB: Missing request parameter "${filters[missingParamIndex]}" for customQuery placeholder`
                );
            }

            if (!pagination) {
                return database.execute(preparedQuery.sql.trim(), queryParamsForCustomQuery, connection);
            }

            let query = database.select(
                `(${preparedQuery.sql.trim().replace(/;\s*$/, '')}) AS dab_custom_query`
            );
            const page = parseInt(queryParams?.page, 10) || 1;
            const limit = parseInt(queryParams?.limit, 10) || 10;
            query = database.paginate(query, limit, (page - 1) * limit);
            const builtQuery = database.build(query);
            return database.execute(builtQuery.sql, queryParamsForCustomQuery, connection);
        }

        const hasFilterValue = filters && queryParams && filters.some(filter => (
            queryParams[filter] !== undefined &&
            queryParams[filter] !== null &&
            queryParams[filter] !== ''
        ));
        const hasOrFilter = queryParams?._or && filterConfig?.orFields;
        if (!pagination && !hasFilterValue && !hasOrFilter) {
            return database.execute(customQuery.trim(), [], connection);
        }

        let query = database.select(`(${customQuery.trim().replace(/;\s*$/, '')}) AS dab_custom_query`);

        if (filters && queryParams) {
            query = this._applyFilters(query, filters, queryParams, filterConfig, database);
        }

        if (pagination) {
            const page = parseInt(queryParams?.page, 10) || 1;
            const limit = parseInt(queryParams?.limit, 10) || 10;
            query = database.paginate(query, limit, (page - 1) * limit);
        }

        const builtQuery = database.build(query);
        return database.execute(builtQuery.sql, builtQuery.params, connection);
    }

    /**
     * Convert positional `?` placeholders to the configured database syntax.
     * Question marks inside quoted strings and SQL comments are left untouched.
     * @private
     */
    static _prepareCustomQuery(customQuery, database) {
        let sql = '';
        let placeholderCount = 0;
        let quote = null;
        let lineComment = false;
        let blockComment = false;

        for (let i = 0; i < customQuery.length; i++) {
            const char = customQuery[i];
            const next = customQuery[i + 1];

            if (lineComment) {
                sql += char;
                if (char === '\n') lineComment = false;
                continue;
            }

            if (blockComment) {
                sql += char;
                if (char === '*' && next === '/') {
                    sql += next;
                    i++;
                    blockComment = false;
                }
                continue;
            }

            if (quote) {
                sql += char;
                if (char === '\\' && next !== undefined) {
                    sql += next;
                    i++;
                } else if (char === quote) {
                    if (next === quote) {
                        sql += next;
                        i++;
                    } else {
                        quote = null;
                    }
                }
                continue;
            }

            if (char === "'" || char === '"' || char === '`') {
                quote = char;
                sql += char;
            } else if (char === '/' && next === '*') {
                blockComment = true;
                sql += char + next;
                i++;
            } else if ((char === '-' && next === '-') || char === '#') {
                lineComment = true;
                sql += char;
                if (next === '-') {
                    sql += next;
                    i++;
                }
            } else if (char === '?') {
                placeholderCount++;
                sql += database.config?.type === 'postgres'
                    ? `$${placeholderCount}`
                    : '?';
            } else {
                sql += char;
            }
        }

        return { sql, placeholderCount };
    }

    /**
     * Apply the configured READ filters to a query object.
     * @private
     */
    static _applyFilters(query, filters, queryParams, filterConfig, database) {
        filters.forEach(filter => {
            const filterDef = filterConfig && filterConfig[filter];
            const operator = filterDef?.operator || '=';
            const value = queryParams[filter];

            if (value !== undefined && value !== null && value !== '') {
                if (typeof value === 'string' && value.includes(',') && operator === '=') {
                    query = database.whereIn(query, filter, value.split(','));
                } else if (operator === 'LIKE' || operator === 'like') {
                    query = database.where(query, filter, `%${value}%`, 'LIKE');
                } else {
                    query = database.where(query, filter, value, operator);
                }
            }
        });

        if (queryParams._or && filterConfig?.orFields) {
            query = database.whereOr(query, filterConfig.orFields, queryParams._or);
        }

        return query;
    }

    /**
     * Handle CREATE operation
     * @private
     */
    static async _handleCreate(table, columns, data, database, connection) {
        const insertData = {};
        columns.forEach(col => {
            if (data[col] !== undefined) {
                insertData[col] = data[col];
            }
        });

        const query = database.insert(table, insertData);
        const result = await database.execute(query.sql, query.params, connection);
        const id = Array.isArray(result) ? result[0]?.id : result.insertId;
        return { id, ...insertData };
    }

    /**
     * Handle READ operation
     * @private
     */
    static async _handleRead(table, filters, pagination, queryParams, joins, columns, filterConfig, database) {
        let query = database.select(table, columns || ['*']);

        // Apply joins if configured
        if (joins && Array.isArray(joins)) {
            joins.forEach(join => {
                const joinMethod = join.type === 'LEFT' ? 'leftJoin' :
                    join.type === 'RIGHT' ? 'rightJoin' : 'join';
                query = database[joinMethod](query, join.table, join.condition);
            });
        }

        if (filters && queryParams) {
            query = this._applyFilters(query, filters, queryParams, filterConfig, database);
        }

        // Apply pagination
        if (pagination) {
            const page = parseInt(queryParams?.page, 10) || 1;
            const limit = parseInt(queryParams?.limit, 10) || 10;
            const offset = (page - 1) * limit;
            query = database.paginate(query, limit, offset);
        }

        const builtQuery = database.build(query);
        const results = await database.execute(builtQuery.sql, builtQuery.params);
        return results;
    }

    /**
     * Handle UPDATE operation
     * @private
     */
    static async _handleUpdate(table, columns, params, data, database, connection) {
        const updateData = {};
        columns.forEach(col => {
            if (data[col] !== undefined) {
                updateData[col] = data[col];
            }
        });

        const query = database.update(table, updateData, params.id);
        const result = await database.execute(query.sql, query.params, connection);

        // Detect whether any row was updated.
        // For Postgres we use RETURNING id which returns an array of rows when updated.
        // For MySQL the execute returns an OkPacket with affectedRows.
        let updatedCount = 0;
        if (Array.isArray(result)) {
            updatedCount = result.length;
        } else if (result && typeof result.affectedRows === 'number') {
            updatedCount = result.affectedRows;
        }

        if (updatedCount === 0) {
            return null; // signal not found / nothing updated
        }

        return { id: params.id, ...updateData };
    }

    /**
     * Handle DELETE operation
     * @private
     */
    static async _handleDelete(table, params, database, connection) {
        const query = database.delete(table, params.id);
        await database.execute(query.sql, query.params, connection);
        return { id: params.id, deleted: true };
    }

    /**
     * Execute CRUD step in transaction
     * @private
     */
    static async _executeCRUDStep(step, req, previousResults, database, connection) {
        if (step.customQuery !== undefined) {
            return this._executeCustomQuery(
                step.customQuery,
                database,
                connection,
                step.pagination,
                req.query,
                step.filters,
                step.filterConfig,
                step.operation === 'CREATE' || step.operation === 'UPDATE' ? req.body : {
                    ...req.query,
                    ...req.params
                }
            );
        }

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
                return await this._handleCreate(table, columns, data, database, connection);
            case 'UPDATE':
                return await this._handleUpdate(table, columns, req.params, data, database, connection);
            default:
                throw new Error(`Unknown operation in transaction: ${operation}`);
        }
    }
}

module.exports = DabExecutor;
