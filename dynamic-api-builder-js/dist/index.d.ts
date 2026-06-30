import { Router, Request, Response, NextFunction, RequestHandler } from "express";

// ---------------------------------------------------------------------------
// Shared / primitive types
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type DatabaseType = "mysql" | "postgres";

export type CrudOperation = "CREATE" | "READ" | "UPDATE" | "DELETE";

export type ApiType = "CRUD" | "TRANSACTION" | "FUNCTION" | "CALL_FUNCTION" | "CALL_PROCEDURE";

export type ParamSource = "body" | "query" | "params" | "headers" | "static";

export type JoinType = "INNER" | "LEFT" | "RIGHT";

export type OrderDirection = "ASC" | "DESC";

// ---------------------------------------------------------------------------
// Database configuration
// ---------------------------------------------------------------------------

export interface DatabaseConfig {
    host?: string;
    user?: string;
    password?: string;
    database?: string;
    port?: number;
}

export interface DabConfig {
    /** Array of API endpoint definitions */
    apis: ApiDefinition[];
    /** Database connection settings */
    database?: DatabaseConfig;
    /** Database type – defaults to "mysql" */
    type?: DatabaseType;
    /** Max pool connections – defaults to 10 */
    connectionLimit?: number;
}

// ---------------------------------------------------------------------------
// API definition
// ---------------------------------------------------------------------------

export interface ValidationRules {
    /** Field name → pipe-separated rule string, e.g. "required|string|min:3" */
    [field: string]: string;
}

export interface FilterConfig {
    /** Field name → comparison operator, e.g. { name: "LIKE", status: "=" } */
    [field: string]: string | FilterFieldConfig;
}

export interface FilterFieldConfig {
    operator: string;
}

export interface JoinDefinition {
    type: JoinType;
    table: string;
    condition: string;
}

export interface HooksConfig {
    before?: string;
    after?: string;
}

export interface ParamDefinition {
    name: string;
    source: ParamSource;
    /** Required when source is "static" */
    value?: unknown;
}

export interface TransactionStep {
    type: "CRUD" | "FUNCTION";
    operation?: CrudOperation;
    table?: string;
    columns?: string[];
    /** Maps target keys to values from previous step results, e.g. { user_id: "$createUser.id" } */
    map?: Record<string, string>;
    handler?: string;
    saveAs?: string;
}

export interface ApiDefinition {
    /** Unique identifier for the route */
    id?: string;
    /** Express-style path, e.g. "/users/:id" */
    endpoint: string;
    method: HttpMethod;
    type: ApiType;

    // CRUD / READ fields
    table?: string;
    operation?: CrudOperation;
    columns?: string[];
    filters?: string[];
    filterConfig?: FilterConfig;
    joins?: JoinDefinition[];
    pagination?: boolean;
    hooks?: HooksConfig;
    validation?: ValidationRules;

    // TRANSACTION fields
    steps?: TransactionStep[];

    // FUNCTION fields
    handler?: string;

    // CALL_FUNCTION fields
    function?: string;

    // CALL_PROCEDURE fields
    procedure?: string;

    // CALL_FUNCTION / CALL_PROCEDURE shared
    params?: ParamDefinition[];
}

// ---------------------------------------------------------------------------
// Router options
// ---------------------------------------------------------------------------

export interface DabRouterOptions {
    middleware?: RequestHandler | RequestHandler[];
}

// ---------------------------------------------------------------------------
// Query builder internals
// ---------------------------------------------------------------------------

export interface SelectQuery {
    type: "SELECT";
    table: string;
    columns: string[];
    joins: Array<{ type: JoinType; table: string; condition: string }>;
    conditions: Array<WhereCondition | WhereInCondition>;
    orConditions: Array<WhereOrCondition>;
    groupBy: string[] | null;
    limit: number | null;
    offset: number | null;
    orderBy: { field: string; direction: OrderDirection } | null;
}

export interface WhereCondition {
    field: string;
    value: unknown;
    operator: string;
}

export interface WhereInCondition {
    field: string;
    values: unknown[];
    operator: "IN";
}

export interface WhereOrCondition {
    fields: string[];
    value: unknown;
}

export interface BuiltQuery {
    sql: string;
    params: unknown[];
}

export interface InsertQuery {
    sql: string;
    params: unknown[];
}

export interface UpdateQuery {
    sql: string;
    params: unknown[];
}

export interface DeleteQuery {
    sql: string;
    params: unknown[];
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface SuccessResponse<T = unknown> {
    success: true;
    message: string;
    data: T;
    timestamp: string;
}

export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: number;
        details: unknown | null;
    };
    timestamp: string;
}

export interface PaginatedResponse<T = unknown> {
    success: true;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
    timestamp: string;
}

export interface ValidationErrorResponse {
    success: false;
    error: {
        message: "Validation failed";
        code: 400;
        details: ValidationError[];
    };
    timestamp: string;
}

export interface ValidationError {
    field: string;
    message: string;
}

// ---------------------------------------------------------------------------
// DabValidator
// ---------------------------------------------------------------------------

export declare class DabValidator {
    /**
     * Validate an Express request against an API config's validation rules.
     * Returns an array of `{ field, message }` objects; empty array = valid.
     */
    static validate(req: Request, apiConfig: ApiDefinition): ValidationError[];
}

// ---------------------------------------------------------------------------
// DabQueryBuilder  (singleton — exported as an instance)
// ---------------------------------------------------------------------------

export declare class DabQueryBuilder {
    /** Configure the database pool. Must be called before any query methods. */
    configure(config: DabConfig): void;

    /** Execute raw SQL with positional parameters. */
    execute(sql: string, params?: unknown[]): Promise<unknown[]>;

    /** Start building a SELECT query. */
    select(table: string, columns?: string[]): SelectQuery;

    /** Build an INSERT statement. */
    insert(table: string, data: Record<string, unknown>): InsertQuery;

    /** Build an UPDATE statement (matches by `id`). */
    update(table: string, data: Record<string, unknown>, id: unknown): UpdateQuery;

    /** Build a DELETE statement (matches by `id`). */
    delete(table: string, id: unknown): DeleteQuery;

    /** Add a WHERE condition to a SELECT query. */
    where(query: SelectQuery, field: string, value: unknown, operator?: string): SelectQuery;

    /** Add a WHERE IN condition to a SELECT query. */
    whereIn(query: SelectQuery, field: string, values: unknown[]): SelectQuery;

    /** Add OR-LIKE conditions across multiple fields to a SELECT query. */
    whereOr(query: SelectQuery, fields: string[], value: unknown): SelectQuery;

    /** Add LIMIT / OFFSET pagination to a SELECT query. */
    paginate(query: SelectQuery, limit: number, offset: number): SelectQuery;

    /** Add ORDER BY to a SELECT query. */
    orderBy(query: SelectQuery, field: string, direction?: OrderDirection): SelectQuery;

    /** Add an INNER JOIN to a SELECT query. */
    join(query: SelectQuery, table: string, condition: string): SelectQuery;

    /** Add a LEFT JOIN to a SELECT query. */
    leftJoin(query: SelectQuery, table: string, condition: string): SelectQuery;

    /** Add a RIGHT JOIN to a SELECT query. */
    rightJoin(query: SelectQuery, table: string, condition: string): SelectQuery;

    /** Add GROUP BY to a SELECT query. */
    groupBy(query: SelectQuery, fields: string | string[]): SelectQuery;

    /** Compile a SELECT query into a `{ sql, params }` object ready for `execute()`. */
    build(query: SelectQuery): BuiltQuery;

    /** Call a database stored FUNCTION and return its scalar result. */
    callFunction(funcName: string, params?: unknown[]): Promise<unknown>;

    /** Call a database stored PROCEDURE and return all result sets. */
    callProcedure(procName: string, params?: unknown[]): Promise<unknown[][]>;

    /** Begin a database transaction. */
    beginTransaction(): Promise<void>;

    /** Commit the current transaction. */
    commit(): Promise<void>;

    /** Roll back the current transaction. */
    rollback(): Promise<void>;

    /** Release all pool connections. */
    close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// DabHooks
// ---------------------------------------------------------------------------

export type HookFunction = (req: Request, data?: unknown) => Promise<unknown> | unknown;

export declare class DabHooks {
    /** Execute a registered hook by name. */
    execute(hookName: string, req: Request, data?: unknown): Promise<unknown>;

    /** Register a single custom hook. */
    register(name: string, fn: HookFunction): void;

    /** Register multiple hooks at once. */
    registerBatch(hooks: Record<string, HookFunction>): void;

    /** Check whether a hook with the given name is registered. */
    has(name: string): boolean;

    /** Remove a registered hook. */
    unregister(name: string): void;
}

// ---------------------------------------------------------------------------
// DabExecutor
// ---------------------------------------------------------------------------

export interface ExecutorResult {
    status: number;
    data: unknown;
}

export declare class DabExecutor {
    /** Execute a CRUD operation defined in an API config. */
    static executeCRUD(apiConfig: ApiDefinition, req: Request): Promise<ExecutorResult>;

    /** Execute a multi-step transaction defined in an API config. */
    static executeTransaction(apiConfig: ApiDefinition, req: Request): Promise<ExecutorResult>;

    /** Execute a database stored FUNCTION defined in an API config. */
    static executeCallFunction(apiConfig: ApiDefinition, req: Request): Promise<ExecutorResult>;

    /** Execute a database stored PROCEDURE defined in an API config. */
    static executeCallProcedure(apiConfig: ApiDefinition, req: Request): Promise<ExecutorResult>;

    /** Execute a custom JavaScript function (hook) defined in an API config. */
    static executeFunction(apiConfig: ApiDefinition, req: Request): Promise<ExecutorResult>;
}

// ---------------------------------------------------------------------------
// DabRouter
// ---------------------------------------------------------------------------

export declare class DabRouter {
    /**
     * Create an Express `Router` from an array of API definitions.
     * @param apis     Array of API endpoint configs
     * @param options  Optional middleware / router settings
     */
    static createRouter(apis: ApiDefinition[], options?: DabRouterOptions): Router;
}

// ---------------------------------------------------------------------------
// DabResponse
// ---------------------------------------------------------------------------

export declare class DabResponse {
    /** Wrap data in a standard success envelope. */
    static success<T = unknown>(data: T, message?: string): SuccessResponse<T>;

    /** Wrap an error in a standard error envelope. */
    static error(message: string, code?: number, details?: unknown): ErrorResponse;

    /** Wrap paginated results in a standard paginated envelope. */
    static paginated<T = unknown>(
        data: T[],
        page: number,
        limit: number,
        total: number
    ): PaginatedResponse<T>;

    /** Wrap validation errors in a standard 400 envelope. */
    static validationError(errors: ValidationError[]): ValidationErrorResponse;

    /**
     * Returns an Express error-handling middleware that formats all
     * errors (including DB errors) using the DAB error envelope.
     */
    static errorHandler(): (
        err: Error & { status?: number; code?: string; errors?: unknown },
        req: Request,
        res: Response,
        next: NextFunction
    ) => void;
}

// ---------------------------------------------------------------------------
// dabApi – default export / main initialiser
// ---------------------------------------------------------------------------

export interface DabApiInstance {
    /** Configured Express router — mount with `app.use(prefix, instance.router)` */
    router: Router;
    validator: typeof DabValidator;
    executor: typeof DabExecutor;
    queryBuilder: DabQueryBuilder;
    hooks: DabHooks;
    response: typeof DabResponse;
}

/**
 * Initialise the DAB API engine.
 *
 * @example
 * ```ts
 * import dabApi from "dynamic-api-builder-js";
 *
 * const { router } = dabApi({
 *   database: { host: "localhost", user: "root", password: "secret", database: "mydb" },
 *   apis: [
 *     { id: "listUsers", endpoint: "/users", method: "GET", type: "CRUD",
 *       operation: "READ", table: "users" }
 *   ]
 * });
 *
 * app.use("/api", router);
 * ```
 */
declare function dabApi(config: DabConfig, options?: DabRouterOptions): DabApiInstance;

export default dabApi;

// Named re-exports (mirror of module.exports.DabXxx)
export { DabRouter, DabValidator, DabExecutor, DabQueryBuilder, DabHooks, DabResponse };