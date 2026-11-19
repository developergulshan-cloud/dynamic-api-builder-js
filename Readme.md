# dynamic-api-builder-js

Build Express REST endpoints from JavaScript or JSON configuration. DAB registers routes, validates requests, builds parameterized CRUD queries, runs transaction steps, invokes registered JavaScript hooks, and can call database functions and procedures.

> **Package name:** `dab-api-module` (from this repository's `package.json`). The checked-in declaration file and examples also use `dynamic-api-builder-js`; use the package name you installed in `require()`/`import`.

## Contents

- [Requirements and install](#requirements-and-install)
- [Quick start](#quick-start)
- [Root configuration](#root-configuration)
- [API definition reference](#api-definition-reference)
- [CRUD APIs](#crud-apis)
- [Filters, joins, and pagination](#filters-joins-and-pagination)
- [Validation](#validation)
- [Hooks and functions](#hooks-and-functions)
- [Transactions](#transactions)
- [Stored database functions and procedures](#stored-database-functions-and-procedures)
- [Custom SQL](#custom-sql)
- [Router middleware](#router-middleware)
- [Responses and errors](#responses-and-errors)
- [Advanced query builder](#advanced-query-builder)
- [Configuration checklist](#configuration-checklist)

## Requirements and install

Use Node.js with an Express application. Install this package and Express in your application:

```bash
npm i dynamic-api-builder-js
```

The module bundles its database drivers (`mysql2` and `pg`) in the published build. Configure one driver per connection. Request JSON parsing must be installed before the DAB router:

```js
app.use(express.json());
```

## Quick start

This complete CommonJS example creates a MySQL-backed read and create endpoint. Replace the credentials and table/column names with your schema.

```js
const express = require('express');
const dabApi = require('dab-api-module');

const app = express();
app.use(express.json());

const { router } = dabApi({
  type: 'mysql',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'app_db',
    port: 3306
  },
  apis: [
    {
      id: 'list-users',
      endpoint: '/users',
      method: 'GET',
      type: 'CRUD',
      operation: 'READ',
      table: 'users',
      columns: ['id', 'name', 'email'],
      filters: ['email'],
      pagination: true
    },
    {
      id: 'create-user',
      endpoint: '/users',
      method: 'POST',
      type: 'CRUD',
      operation: 'CREATE',
      table: 'users',
      columns: ['name', 'email'],
      validation: {
        name: 'required|string|min:2',
        email: 'required|email'
      }
    }
  ]
});

app.use('/api', router);
app.listen(3000, () => console.log('Listening on http://localhost:3000'));
```

Try it:

```bash
curl 'http://localhost:3000/api/users?page=1&limit=20&email=ada@example.com'
curl -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
```

## Root configuration

Call the exported function with a configuration object and optional router options:

```js
const { router, validator, executor, queryBuilder, hooks, response } = dabApi(config, options);
```

| Root field | Type | Required | Meaning |
|---|---|---:|---|
| `apis` | array | Yes | Route definitions. An empty array is valid. |
| `type` | `mysql` or `postgres` | No | Driver for a single connection; defaults to `mysql`. |
| `database` | object | No* | Single connection settings; can also be passed directly as the root fields. |
| `databases` | object | No* | Map of connection names to database configs. |
| `defaultDatabase` | string | No | Default named connection; defaults to the first key in `databases`. |
| `connectionLimit` | number | No | Pool size, defaults to `10`. |

*Database configuration is needed for database-backed APIs. A `FUNCTION` handler can be used without a DB pool.

### Single database

```js
const config = {
  type: 'postgres', // 'mysql' or 'postgres'; default: 'mysql'
  database: {
    host: 'localhost',
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'app_db',
    port: 5432
  },
  connectionLimit: 10,
  apis: []
};
```

Supported connection fields: `host` (default `localhost`), `user` (default `root`), `password` (default empty string), `database` (default empty string; provide a real database), and `port` (default `3306` for MySQL, `5432` for PostgreSQL). Pool settings are internally configured; `connectionLimit` defaults to 10. Keep credentials in environment variables and out of source control.

The equivalent flat form is supported:

```js
const config = {
  type: 'mysql',
  host: 'localhost',
  user: 'app_user',
  password: process.env.DB_PASSWORD,
  database: 'app_db',
  port: 3306,
  apis: []
};
```

### Named databases

Each entry has the same shape as the single database configuration. Set an API's `database` property to select a named connection.

```js
const config = {
  defaultDatabase: 'primary',
  databases: {
    primary: {
      type: 'postgres',
      database: { host: 'localhost', user: 'app', password: process.env.PG_PASSWORD, database: 'main', port: 5432 }
    },
    archive: {
      type: 'mysql',
      database: { host: 'localhost', user: 'app', password: process.env.MYSQL_PASSWORD, database: 'archive', port: 3306 }
    }
  },
  apis: [
    { endpoint: '/users', method: 'GET', type: 'CRUD', operation: 'READ', table: 'users' },
    { endpoint: '/old-users', method: 'GET', type: 'CRUD', operation: 'READ', table: 'users', database: 'archive' }
  ]
};
```

## API definition reference

Each item in `apis` becomes one Express route. Common fields:

| Field | Required | Description |
|---|---:|---|
| `id` | No | Label for your own identification/logging. |
| `name` | No | Descriptive label; currently not used to change runtime behavior. |
| `endpoint` | Yes | Express path, such as `/users` or `/users/:id`. |
| `method` | Yes | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. |
| `type` | Yes | `CRUD`, `TRANSACTION`, `FUNCTION`, `CALL_FUNCTION`, or `CALL_PROCEDURE`. |
| `database` | No | Named connection to use when `databases` is configured. Omit for the default/single connection. |
| `validation` | No | Map of request field names to validation rule strings. |
| `hooks` | No | `{ "before": "hookName", "after": "hookName" }` for supported API types. |

Route paths are mounted beneath the prefix you pass to `app.use`. If `endpoint` is `/users/:id` and the mount prefix is `/api`, the URL is `/api/users/123`.

## CRUD APIs

`type: "CRUD"` requires `operation`: `CREATE`, `READ`, `UPDATE`, or `DELETE`.

### Create

Only request body properties listed in `columns` are inserted. Use `express.json()` before the router.

```json
{
  "id": "create-user",
  "endpoint": "/users",
  "method": "POST",
  "type": "CRUD",
  "operation": "CREATE",
  "table": "users",
  "columns": ["name", "email"]
}
```

Request: `POST /api/users` with `{"name":"Ada","email":"ada@example.com","is_admin":true}`. Only `name` and `email` are inserted. The response data includes the inserted values and an `id` when the driver returns one.

### Read

`columns` controls selected columns and defaults to `*`. `filters` controls which query parameters become `WHERE` conditions.

```json
{
  "id": "get-user",
  "endpoint": "/users/:id",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "table": "users",
  "columns": ["id", "name", "email"],
  "filters": ["status"]
}
```

Note: standard READ uses query parameters for filters; the `:id` route parameter is not automatically added as a condition. To search by a route parameter, use `customQuery` with a placeholder or expose the ID as a query filter.

### Update

Standard UPDATE matches the row using `req.params.id`. Therefore include `:id` in the endpoint. Only request body fields listed in `columns` are updated.

```json
{
  "id": "update-user",
  "endpoint": "/users/:id",
  "method": "PATCH",
  "type": "CRUD",
  "operation": "UPDATE",
  "table": "users",
  "columns": ["name", "email"]
}
```

Request: `PATCH /api/users/42` with `{"name":"Ada"}`. If no row is updated, the route returns `204 No Content`.

### Delete

Standard DELETE also matches `req.params.id`.

```json
{
  "id": "delete-user",
  "endpoint": "/users/:id",
  "method": "DELETE",
  "type": "CRUD",
  "operation": "DELETE",
  "table": "users"
}
```

## Filters, joins, and pagination

These options apply to standard READ and supported custom SELECT queries.

| Field | Shape | Behavior |
|---|---|---|
| `filters` | string array | Permitted query parameter names to apply as filters. Missing/empty parameters are ignored. |
| `filterConfig` | object | Per-field `operator`, plus optional `orFields` array. |
| `pagination` | boolean | When `true`, reads `page` and `limit` from query string; defaults to page 1 and limit 10. |
| `joins` | array | READ joins with `type`, `table`, and `condition`. |

Supported comparison operators depend on the database and include common SQL comparisons such as `=`, `>`, `>=`, `<`, `<=`, and `LIKE`. A `LIKE` filter becomes a contains match (`%value%`). A comma-separated value with `=` becomes `IN (...)`.

```json
{
  "id": "search-products",
  "endpoint": "/products",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "table": "products",
  "columns": ["id", "name", "category", "price"],
  "filters": ["category", "name", "price"],
  "filterConfig": {
    "name": { "operator": "LIKE" },
    "price": { "operator": "<=" },
    "orFields": ["name", "category"]
  },
  "pagination": true,
  "joins": [
    { "type": "LEFT", "table": "categories", "condition": "products.category_id = categories.id" }
  ]
}
```

Examples: `GET /api/products?name=keyboard&price=100&page=2&limit=25` and `GET /api/products?_or=keyboard`. `_or` applies a LIKE search across `filterConfig.orFields`. Join `type` is `INNER`, `LEFT`, or `RIGHT`; table and condition are trusted configuration strings. Pagination limits rows but the current CRUD response does not include total-count metadata.

## Validation

`validation` maps field names to pipe-separated rules. GET APIs validate `req.query`; every other method validates `req.body`. Validation does not coerce values. Rules run in order and the first failure for a field is returned. Fields without `required` are optional.

| Rule | Example | Meaning |
|---|---|---|
| `required` | `required` | Rejects undefined, null, or empty string. |
| `string` | `string` | Value must be a string. |
| `number` | `number` | Value must be a number or convertible to one. |
| `boolean` | `boolean` | Accepts booleans or strings `true` / `false`. |
| `array` | `array` | Value must be an array. |
| `email` | `email` | Basic email format check. |
| `url` | `url` | Must parse as a URL. |
| `min:n` | `min:3` | Minimum length (or array length when applicable). |
| `max:n` | `max:100` | Maximum length (or array length when applicable). |
| `minValue:n` | `minValue:18` | Minimum numeric value. |
| `maxValue:n` | `maxValue:120` | Maximum numeric value. |
| `pattern:regex` | `pattern:^[A-Z]+$` | Must match the supplied regular expression. |
| `in:a,b` | `in:draft,published` | Must equal one of the listed values. |

```json
{
  "validation": {
    "name": "required|string|min:2|max:80",
    "email": "required|email",
    "age": "number|minValue:18|maxValue:120",
    "status": "required|in:draft,published"
  }
}
```

Invalid requests return HTTP 400 with an `error.details` array containing `{ field, message }` objects.

## Hooks and functions

Hooks are registered in a process-wide singleton. A hook receives `(req, data)`, may be synchronous or return a Promise, and its return value is not automatically substituted into the request or response. Built-in hook names are `hashPassword`, `sendWelcomeEmail`, `updateInventory`, and `monthlySalesReport`; the last three are demonstration placeholders. `hashPassword` hashes `req.body.password` in place.

```js
const { router, hooks } = dabApi(config);

hooks.register('auditCreate', async (req, result) => {
  console.log('created by', req.ip, result);
});
hooks.registerBatch({
  beforeSave: async (req) => { req.body.name = req.body.name.trim(); },
  afterSave: async (req, result) => { /* notify an application service */ }
});

app.use('/api', router);
```

Use API `hooks` to name lifecycle hooks:

```json
{
  "hooks": { "before": "beforeSave", "after": "afterSave" }
}
```

For CRUD, before runs before the operation and after runs after success. Stored function/procedure APIs also run these hooks. Unknown hook names log a warning and return `null`. Hook errors fail the request. The router options middleware runs before validation; it is separate from named hooks.

### JavaScript `FUNCTION` endpoint

Use `type: "FUNCTION"` to return arbitrary application logic without CRUD handling. The handler must be registered before requests arrive.

```js
const { router, hooks } = dabApi({
  apis: [{
    id: 'health-summary', endpoint: '/summary', method: 'GET',
    type: 'FUNCTION', handler: 'buildSummary'
  }]
});

hooks.register('buildSummary', async (req) => ({
  requestedAt: new Date().toISOString(),
  period: req.query.period || 'today'
}));
app.use('/api', router);
```

## Transactions

`type: "TRANSACTION"` executes steps sequentially on one DB transaction. Any thrown error rolls back the DB work. Step types are `CRUD` and `FUNCTION`. CRUD steps support `CREATE` and `UPDATE`; `customQuery` steps are also supported. `saveAs` stores a result under that key for later mappings and for function hooks. `map` copies prior step result values into the current CRUD step's input data using `$stepName.path` references.

```js
const config = {
  database: { host: 'localhost', user: 'app', password: process.env.DB_PASSWORD, database: 'shop' },
  apis: [{
    id: 'create-order', endpoint: '/orders', method: 'POST', type: 'TRANSACTION',
    steps: [
      { type: 'CRUD', operation: 'CREATE', table: 'orders', columns: ['user_id', 'total'], saveAs: 'order' },
      { type: 'CRUD', operation: 'CREATE', table: 'order_items', columns: ['order_id', 'product_id', 'quantity'], map: { order_id: '$order.id' } },
      { type: 'FUNCTION', handler: 'afterOrderCreated', saveAs: 'notification' }
    ]
  }]
};
```

Register a step handler as usual: `hooks.register('afterOrderCreated', async (req, results) => { ... })`. It receives the accumulated results object as its second argument. Because hooks can perform external side effects, those side effects are not rolled back if a later database step fails.

CRUD step configuration fields:

| Field | Meaning |
|---|---|
| `type` | `CRUD` or `FUNCTION`. |
| `operation` | For CRUD: `CREATE` or `UPDATE`. |
| `table`, `columns` | Target and allowed input columns for standard CRUD. |
| `map` | Object mapping target field names to prior result paths, e.g. `{ "user_id": "$user.id" }`. |
| `saveAs` | Key under which the step result is stored. |
| `handler` | Registered hook name for a FUNCTION step. |
| `forEach` | Request body array property. Repeats this CRUD step for each object in the array and returns an array of results. |
| `customQuery`, `filters`, `filterConfig`, `pagination` | Custom SQL options described below. |

`forEach` example: a step with `"forEach":"items"` processes `req.body.items`; each item must be an object. In this mode the current item's `id` is also copied to `req.params.id` for an UPDATE step.

## Stored database functions and procedures

These types call the configured database routine. `params` is an ordered array. Each definition has `name`, `source`, and (for `static`) optional `value`. Supported sources: `body`, `query`, `params`, `headers`, `static`. Missing request values are passed as `null`. Stored routine names are configuration and must be trusted.

### `CALL_FUNCTION`

Set `function` to the database function name. The response data is `{ "result": ... }`.

```json
{
  "id": "discount",
  "endpoint": "/discount",
  "method": "POST",
  "type": "CALL_FUNCTION",
  "function": "calculate_discount",
  "params": [
    { "name": "amount", "source": "body" },
    { "name": "code", "source": "body" },
    { "name": "currency", "source": "static", "value": "USD" }
  ],
  "validation": { "amount": "required|number", "code": "required|string" }
}
```

### `CALL_PROCEDURE`

Set `procedure` to the routine name. A single result set is returned as an array; multiple result sets remain nested.

```json
{
  "id": "transfer",
  "endpoint": "/transfers",
  "method": "POST",
  "type": "CALL_PROCEDURE",
  "procedure": "transfer_funds",
  "params": [
    { "name": "from_account", "source": "body" },
    { "name": "to_account", "source": "body" },
    { "name": "amount", "source": "body" },
    { "name": "currency", "source": "static", "value": "USD" }
  ],
  "validation": {
    "from_account": "required|number",
    "to_account": "required|number",
    "amount": "required|number"
  }
}
```

Validation for a GET route reads query parameters; on non-GET routes it reads the JSON body, regardless of parameter source. PostgreSQL routines use the PostgreSQL driver's supported function/procedure call syntax; verify routine semantics with your database/version.

## Custom SQL

CRUD APIs and transaction APIs/steps may set `customQuery`. It replaces generated SQL; `table`, `columns`, and `joins` are ignored for that execution. Keep SQL static and trusted. Bind client values using `?` placeholders; never concatenate request data into the SQL string. DAB converts placeholders to PostgreSQL `$1`, `$2`, etc. when using PostgreSQL.

For every placeholder, provide one corresponding name in `filters`, in left-to-right order. On READ, values are looked up first in route parameters, then query parameters. On CREATE/UPDATE, values come from the request body.

```json
{
  "id": "get-user-by-id",
  "endpoint": "/users/:id",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "customQuery": "SELECT id, name, email FROM users WHERE id = ?",
  "filters": ["id"]
}
```

Request: `GET /api/users/42`. A write example:

```json
{
  "id": "rename-user",
  "endpoint": "/users/:id",
  "method": "PATCH",
  "type": "CRUD",
  "operation": "UPDATE",
  "customQuery": "UPDATE users SET name = ? WHERE id = ?",
  "filters": ["name", "id"],
  "validation": { "name": "required|string", "id": "required|number" }
}
```

Send both `name` and `id` in the JSON body for this write example. For a custom SELECT without placeholders, `filters` instead names result columns that DAB can filter automatically. `filterConfig` works as for normal READ; pagination wraps the custom SQL as a subquery and is intended for SELECT statements. Page defaults to 1 and limit to 10. Do not use pagination on write statements.

## Router middleware

Pass one Express middleware function or an array using the second argument to `dabApi`. Middleware runs before validation on every generated route.

```js
const requireAuth = (req, res, next) => {
  if (!req.get('authorization')) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const { router } = dabApi(config, { middleware: [requireAuth] });
app.use('/api', router);
```

Middleware should call `next()` to continue or end the response. Use standard Express error flow by calling `next(error)`.

## Responses and errors

Successful routes normally return HTTP 200:

```json
{"success":true,"data":[],"timestamp":"2026-01-01T00:00:00.000Z"}
```

The actual `data` shape depends on the operation. Validation failures return HTTP 400. An UPDATE with no matching row returns 204 with no response body. Errors reaching DAB's router error handler use:

```json
{"success":false,"error":{"message":"...","code":500,"details":null},"timestamp":"2026-01-01T00:00:00.000Z"}
```

The module installs its error handler on the returned router. `response.errorHandler()` is also exported for advanced use, but do not register it twice for the same DAB route.

## Advanced query builder

The returned `queryBuilder` singleton exposes raw database access and query-building methods. It is initialized from the root configuration when a database is provided. Raw execution accepts SQL placeholders and an ordered values array:

```js
const { queryBuilder } = dabApi(config);
const rows = await queryBuilder.execute('SELECT id, email FROM users WHERE id = ?', [42]);
```

The builder also exposes `select`, `insert`, `update`, `delete`, `where`, `whereIn`, `whereOr`, `paginate`, `orderBy`, `join`, `leftJoin`, `rightJoin`, `groupBy`, `build`, `callFunction`, `callProcedure`, `beginTransaction`, `commit`, `rollback`, and `close`. These are lower-level APIs; see `src/db/queryBuilder.js` for their exact signatures. Use `close()` during application shutdown to drain pools.

The main function returns `{ router, validator, executor, queryBuilder, hooks, response }`. The package also exports `DabRouter`, `DabValidator`, `DabExecutor`, `DabQueryBuilder`, `DabHooks`, and `DabResponse` as named CommonJS properties.

## Configuration checklist

- Mount JSON parsing before the router (`express.json()`).
- Match each API's `type` and required fields (`operation`, `table`, `columns`, `handler`, `function`, or `procedure`).
- Use `:id` for standard UPDATE/DELETE; standard READ does not infer route-param filters.
- List only writable columns in `columns`; request fields outside the list are ignored.
- Add `required` validation where values must be supplied.
- Keep SQL, table names, column names, join conditions, routine names, and hook names in trusted configuration.
- Use `?` bindings for client-supplied custom SQL values.
- Verify database routine syntax and schema against your selected MySQL/PostgreSQL version.
