/**
 * LCAP Query Builder Module
 * Database abstraction and query building
 */

const mysql = require('mysql2/promise');

class LcapQueryBuilder {
    constructor() {
        this.pool = null;
        this.connection = null;
    }

    /**
     * Configure database connection
     */
    configure(config) {
        if (!config) {
            throw new Error('LCAP QueryBuilder: Database configuration is required');
        }

        this.config = {
            host: config.host || 'localhost',
            user: config.user || 'root',
            password: config.password || '',
            database: config.database,
            port: config.port || 3306,
            waitForConnections: true,
            connectionLimit: config.connectionLimit || 10,
            queueLimit: 0
        };
    }

    /**
     * Initialize connection pool
     */
    async _initPool() {
        if (!this.pool) {
            if (!this.config) {
                throw new Error('LCAP QueryBuilder: Database not configured. Call configure() first.');
            }

            try {
                this.pool = mysql.createPool(this.config);
                console.log('✅ LCAP: Database connection pool initialized');
            } catch (error) {
                console.error('❌ LCAP: Database connection failed:', error.message);
                throw error;
            }
        }
    }

    /**
     * Execute SQL query
     */
    async execute(sql, params = []) {
        await this._initPool();

        try {
            const connection = this.connection || this.pool;
            const [rows] = await connection.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('❌ LCAP: Query execution failed:', error.message);
            throw error;
        }
    }

    /**
     * Build SELECT query
     */
    select(table, columns = ['*']) {
        return {
            type: 'SELECT',
            table,
            columns: Array.isArray(columns) ? columns : [columns],
            joins: [],
            conditions: [],
            orConditions: [],
            groupBy: null,
            limit: null,
            offset: null,
            orderBy: null
        };
    }

    /**
     * Build INSERT query
     */
    insert(table, data) {
        const columns = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const values = Object.values(data);

        return {
            sql: `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
            params: values
        };
    }

    /**
     * Build UPDATE query
     */
    update(table, data, id) {
        const sets = Object.keys(data).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(data), id];

        return {
            sql: `UPDATE ${table} SET ${sets} WHERE id = ?`,
            params: values
        };
    }

    /**
     * Build DELETE query
     */
    delete(table, id) {
        return {
            sql: `DELETE FROM ${table} WHERE id = ?`,
            params: [id]
        };
    }

    /**
     * Add WHERE condition
     */
    where(query, field, value, operator = '=') {
        query.conditions.push({ field, value, operator });
        return query;
    }

    /**
     * Add WHERE IN condition
     */
    whereIn(query, field, values) {
        query.conditions.push({
            field,
            values: Array.isArray(values) ? values : [values],
            operator: 'IN'
        });
        return query;
    }

    /**
     * Add WHERE OR condition (search across multiple fields)
     */
    whereOr(query, fields, value) {
        query.orConditions.push({ fields, value });
        return query;
    }

    /**
     * Add pagination
     */
    paginate(query, limit, offset) {
        query.limit = limit;
        query.offset = offset;
        return query;
    }

    /**
     * Add ORDER BY
     */
    orderBy(query, field, direction = 'ASC') {
        query.orderBy = { field, direction };
        return query;
    }

    /**
     * Add INNER JOIN
     */
    join(query, table, condition) {
        query.joins.push({
            type: 'INNER',
            table,
            condition
        });
        return query;
    }

    /**
     * Add LEFT JOIN
     */
    leftJoin(query, table, condition) {
        query.joins.push({
            type: 'LEFT',
            table,
            condition
        });
        return query;
    }

    /**
     * Add RIGHT JOIN
     */
    rightJoin(query, table, condition) {
        query.joins.push({
            type: 'RIGHT',
            table,
            condition
        });
        return query;
    }

    /**
     * Add GROUP BY
     */
    groupBy(query, fields) {
        query.groupBy = Array.isArray(fields) ? fields : [fields];
        return query;
    }

    /**
     * Build final SQL from query object
     */
    build(query) {
        if (query.type !== 'SELECT') {
            throw new Error('Can only build SELECT queries');
        }

        let sql = `SELECT ${query.columns.join(', ')} FROM ${query.table}`;
        const params = [];

        // Add JOINs
        if (query.joins.length > 0) {
            query.joins.forEach(join => {
                sql += ` ${join.type} JOIN ${join.table} ON ${join.condition}`;
            });
        }

        // Add WHERE conditions
        const whereClauses = [];

        if (query.conditions.length > 0) {
            query.conditions.forEach(cond => {
                if (cond.operator === 'IN') {
                    const placeholders = cond.values.map(() => '?').join(', ');
                    whereClauses.push(`${cond.field} IN (${placeholders})`);
                    params.push(...cond.values);
                } else {
                    whereClauses.push(`${cond.field} ${cond.operator} ?`);
                    params.push(cond.value);
                }
            });
        }

        // Add OR conditions
        if (query.orConditions.length > 0) {
            query.orConditions.forEach(orCond => {
                const orClauses = orCond.fields.map(field => {
                    params.push(orCond.value);
                    return `${field} LIKE ?`;
                });
                whereClauses.push(`(${orClauses.join(' OR ')})`);
            });
        }

        if (whereClauses.length > 0) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Add GROUP BY
        if (query.groupBy) {
            sql += ` GROUP BY ${query.groupBy.join(', ')}`;
        }

        // Add ORDER BY
        if (query.orderBy) {
            sql += ` ORDER BY ${query.orderBy.field} ${query.orderBy.direction}`;
        }

        // Add LIMIT and OFFSET
        if (query.limit !== null) {
            sql += ` LIMIT ${query.limit}`;
            if (query.offset !== null) {
                sql += ` OFFSET ${query.offset}`;
            }
        }

        return { sql, params };
    }

    /**
     * Call a MySQL stored FUNCTION and return the scalar result
     * @param {string} funcName  - DB function name (e.g. "get_discount")
     * @param {Array}  params    - Positional parameter values
     * @returns {*} The scalar value returned by the function
     */
    async callFunction(funcName, params = []) {
        const placeholders = params.map(() => '?').join(', ');
        const sql = `SELECT ${funcName}(${placeholders}) AS __result`;
        const rows = await this.execute(sql, params);
        return rows[0].__result;
    }

    /**
     * Call a MySQL stored PROCEDURE
     * @param {string} procName  - DB procedure name (e.g. "transfer_funds")
     * @param {Array}  params    - Positional parameter values
     * @returns {Array} All result sets returned by the procedure
     */
    async callProcedure(procName, params = []) {
        await this._initPool();

        const placeholders = params.map(() => '?').join(', ');
        const sql = `CALL ${procName}(${placeholders})`;

        try {
            const connection = this.connection || this.pool;
            // query() (not execute()) returns multiple result sets for CALL
            const [results] = await connection.query(sql, params);
            // mysql2 wraps each result set in an array; filter out the OkPacket
            const resultSets = Array.isArray(results[0]) ? results : [results];
            return resultSets.filter(rs => Array.isArray(rs));
        } catch (error) {
            console.error('❌ LCAP: Procedure call failed:', error.message);
            throw error;
        }
    }

    /**
     * Begin transaction
     */
    async beginTransaction() {
        await this._initPool();
        this.connection = await this.pool.getConnection();
        await this.connection.beginTransaction();
    }

    /**
     * Commit transaction
     */
    async commit() {
        if (this.connection) {
            await this.connection.commit();
            this.connection.release();
            this.connection = null;
        }
    }

    /**
     * Rollback transaction
     */
    async rollback() {
        if (this.connection) {
            await this.connection.rollback();
            this.connection.release();
            this.connection = null;
        }
    }

    /**
     * Close all connections
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }
}

// Export singleton instance
module.exports = new LcapQueryBuilder();