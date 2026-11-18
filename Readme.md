# dynamic-api-js

A **configuration-driven REST API generator** for Node.js. Define your entire API surface in a single JSON file — dynamic-api-js auto-generates Express routes, handles validation, executes database queries, runs lifecycle hooks, and calls stored procedures/functions, all without writing repetitive boilerplate.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Build System](#build-system)
- [Configuration Reference](#configuration-reference)
  - [Root Config Object](#root-config-object)
  - [API Types](#api-types)
    - [CRUD](#1-crud)
    - [How to use customQuery](#how-to-use-customquery)
    - [TRANSACTION](#2-transaction)
    - [FUNCTION](#3-function)
    - [CALL\_FUNCTION](#4-call_function)
    - [CALL\_PROCEDURE](#5-call_procedure)
  - [Validation Rules](#validation-rules)
  - [Hooks](#hooks)
  - [Filters & Pagination](#filters--pagination)
  - [Joins](#joins)
  - [Parameter Sources](#parameter-sources)
- [Environment Variables](#environment-variables)
- [Advanced Usage](#advanced-usage)
  - [Custom Middleware](#custom-middleware)
  - [Registering Custom Hooks](#registering-custom-hooks)
- [API Response Format](#api-response-format)
- [Health Check](#health-check)
- [Complete api.json Example](#complete-apijson-example)

---

## Features

- **Zero-boilerplate CRUD** — map HTTP routes to DB tables in JSON
- **Multi-step Transactions** — chain INSERT/UPDATE steps with result passing
- **Stored Procedure & Function calls** — invoke DB callables with typed param sources
- **Custom Function hooks** — before/after hooks per API, plus standalone function endpoints
- **Built-in validation** — pipe-separated rule strings (`required|email|min:8`)
- **Advanced filters** — equality, LIKE, IN (comma-separated), OR groups, operators
- **JOIN support** — INNER, LEFT, RIGHT joins configured declaratively
- **Pagination** — query-driven `?page=&limit=` pagination
- **Self-contained bundle** — esbuild bundles everything into a single `dist/index.js`; no `node_modules` needed at runtime

---

## Project Structure

```
dynamic-api-js/
├── api.json                  # API definitions (your config file)
├── server.js                 # Example Express server entry point
├── example.js                # Usage examples
├── build.js                  # esbuild-based build script
├── .env                      # Environment variables
├── package.json
└── src/
    ├── index.js              # Module entry — initializes and exports dynamic-api-js
    ├── router/
    │   └── dynamicRouter.js  # Auto-generates Express routes from config
    ├── engine/
    │   ├── executor.js       # Executes CRUD, TRANSACTION, FUNCTION, CALL_*
    │   ├── validator.js      # Request validation engine
    │   ├── hooks.js          # Lifecycle hook registry and built-in hooks
    │   └── response.js       # Response shaping utilities
    ├── db/
    │   └── queryBuilder.js   # MySQL query builder & connection pool
    └── utills/
        └── error.js          # Error handling utilities
```

---

## Installation

```bash
# Clone / unzip the project
cd dynamic-api-js

# Install dependencies
npm install

# Copy and configure environment variables
cp .env .env.local   # edit with your DB credentials
```

**Runtime dependencies** (bundled into `dist/` at build time):

| Package | Purpose |
|---|---|
| `mysql2` | MySQL/MariaDB connection pool |
| `bcryptjs` | Password hashing hook |
| `cors` | Cross-origin headers |

**Dev dependencies** (only needed to build or run the dev server):

| Package | Purpose |
|---|---|
| `esbuild` | Fast JS bundler |
| `express` | HTTP server (dev server only) |

---

## Quick Start

### 1. Configure your database

Edit `.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=yourpassword
DB_NAME=your_database
```

### 2. Define your APIs

Create or edit `api.json`:

```json
{
  "version": "1.0",
  "basePath": "/api",
  "apis": [
    {
      "id": "get-users",
      "endpoint": "/users",
      "method": "GET",
      "type": "CRUD",
      "operation": "READ",
      "table": "users",
      "columns": ["id", "name", "email"],
      "filters": ["email"],
      "pagination": true
    }
  ]
}
```

### 3. Build the module

```bash
npm run build
```

### 4. Start the server

```bash
npm start
```

The server starts at `http://localhost:3000`. Test the health endpoint:

```bash
curl http://localhost:3000/health
# {"status":"ok","message":"dynamic-api-js is running"}
```

Call your generated API:

```bash
curl "http://localhost:3000/api/users?page=1&limit=10&email=test@example.com"
```

---

## Build System

dynamic-api-js uses **esbuild** to compile `src/` into a fully self-contained `dist/index.js`. Every dependency is inlined — you can ship `dist/index.js` without any `node_modules`.

| Command | Description |
|---|---|
| `npm run build` | Production build — minified, tree-shaken, no sourcemap |
| `npm run build:dev` | Development build — readable output with inline sourcemaps |
| `npm run build:watch` | Watch mode — rebuilds automatically on file changes |
| `npm run build:analyze` | Production build + per-module size report in `dist/meta.json` |
| `npm start` | Run the dev server with Node.js `--watch` (auto-restarts) |

### Build output

```
dist/
├── index.js       # Self-contained bundle (required at runtime)
└── meta.json      # Bundle analysis (only created with --analyze)
```

### Using the built module in your own Express app

```js
const express   = require('express');
const dynamicApi = require('./dist/index');   // the built bundle
const apis       = require('./api.json');

const app = express();
app.use(express.json());

const { router } = dynamicApi({
  database: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  },
  apis: apis.apis
});

app.use('/api', router);
app.listen(3000);
```

---

## Configuration Reference

All API behaviour is driven by the `apis` array in your config object (or `api.json`).

### Root Config Object

```js
dynamicApi({
  database: { ... },   // MySQL connection options
  apis: [ ... ]        // Array of API definition objects
});
```

For APIs that use two databases at the same time, configure each connection by name and select it on each API:

```js
dynamicApi({
  defaultDatabase: 'postgres',
  databases: {
    postgres: {
      type: 'postgres',
      database: {
        host: process.env.PG_HOST,
        user: process.env.PG_USER,
        password: process.env.PG_PASS,
        database: process.env.PG_NAME,
        port: 5432
      }
    },
    mysql: {
      type: 'mysql',
      database: {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASS,
        database: process.env.MYSQL_NAME,
        port: 3306
      }
    }
  },
  apis: [
    { endpoint: '/users', method: 'GET', type: 'CRUD', operation: 'READ', table: 'users' },
    { endpoint: '/legacy-users', method: 'GET', type: 'CRUD', operation: 'READ', table: 'users', database: 'mysql' }
  ]
});
```

Each configured database has its own connection pool. An API's optional `database` field chooses that pool; APIs without the field use `defaultDatabase` (the first configured database if omitted). The existing single `database` configuration remains supported.

**`database` options:**

| Field | Default | Description |
|---|---|---|
| `host` | `localhost` | MySQL server host |
| `user` | `root` | MySQL user |
| `password` | `""` | MySQL password |
| `database` | *(required)* | Database name |
| `port` | `3306` | MySQL port |
| `connectionLimit` | `10` | Connection pool size |

---

### API Types

Every API definition object shares these common top-level fields:

| Field | Required | Description |
|---|---|---|
| `id` | Recommended | Unique identifier (used in logs) |
| `name` | Optional | Human-readable label |
| `endpoint` | **Yes** | Route path (e.g. `/users`, `/users/:id`) |
| `method` | **Yes** | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `type` | **Yes** | API type — see below |
| `permission` | Optional | Permission key (informational, for your auth middleware) |
| `validation` | Optional | Validation rules object |
| `hooks` | Optional | `{ before: "hookName", after: "hookName" }` |
| `database` | Optional | Name of the configured database connection to use; defaults to `defaultDatabase` |

---

#### 1. CRUD

Maps an HTTP route to a single database table operation.

```json
{
  "id": "create-user",
  "endpoint": "/users",
  "method": "POST",
  "type": "CRUD",
  "operation": "CREATE",
  "table": "users",
  "columns": ["name", "email", "password"],
  "validation": {
    "name": "required|string|min:3",
    "email": "required|email",
    "password": "required|string|min:8"
  },
  "hooks": {
    "before": "hashPassword",
    "after": "sendWelcomeEmail"
  }
}
```

**CRUD-specific fields:**

| Field | Operations | Description |
|---|---|---|
| `operation` | All | `CREATE`, `READ`, `UPDATE`, `DELETE` |
| `table` | All | Target database table |
| `columns` | CREATE, UPDATE | Column names to insert/update. Use `["*"]` for SELECT all |
| `filters` | READ | Query param names that become WHERE clauses |
| `filterConfig` | READ | Per-filter operator config (see [Filters](#filters--pagination)) |
| `pagination` | READ | `true` to enable `?page=&limit=` pagination |
| `joins` | READ | Array of JOIN definitions (see [Joins](#joins)) |
| `customQuery` | Any | SQL string to execute instead of building SQL from the CRUD fields |

When `customQuery` is set, it replaces the generated SQL. If the query has no `?` placeholders, `filters` and `filterConfig` are applied to the custom query's result columns using parameterized conditions. If it contains `?` placeholders, `filters` instead names the request parameters to bind to those placeholders, in order, and no generated filters are added. `READ` binds from query parameters; `CREATE` and `UPDATE` bind from the request body. Each placeholder must have a matching filter name and request value. PostgreSQL queries may use `?` in the configuration; DAB converts them to `$1`, `$2`, and so on. Other CRUD query fields such as `table`, `columns`, and `joins` are ignored.

For example, this `READ` query binds from `req.query`:

```json
{
  "id": "get-active-users",
  "endpoint": "/users",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "filters": ["email"],
  "customQuery": "SELECT id, name, email FROM users WHERE active = 1",
  "pagination": true
}
```

`GET /api/users?email=person@example.com&page=2&limit=25` applies the configured filter and pagination to this query. When pagination is enabled, DAB wraps the custom SELECT and applies `LIMIT`/`OFFSET` (defaulting to page 1 and limit 10). Filter names must refer to columns returned by the custom SELECT. Custom SQL is trusted configuration: do not build it by interpolating untrusted request values.

For custom SQL with placeholders, list the matching request parameter names in `filters` order. For `CREATE`/`UPDATE`, these names are read from `req.body`:

```json
{
  "id": "update-user",
  "endpoint": "/users/:id",
  "method": "PUT",
  "type": "CRUD",
  "operation": "UPDATE",
  "filters": ["name", "address", "id"],
  "customQuery": "UPDATE users SET name = ?, address = ? WHERE id = ?"
}
```

`PUT /api/users/42` with body `{"name":"Ada","address":"London","id":42}` binds those values to the three placeholders. Configure the names in SQL placeholder order. The configured SQL is used as written; DAB does not append additional filter conditions.

#### How to use `customQuery`

`customQuery` lets an API run SQL that DAB cannot express with the standard `table`, `columns`, `joins`, and CRUD fields. It is supported on a `CRUD` API, on a `TRANSACTION` API as one top-level statement, and on an individual `CRUD` transaction step. Put the SQL in the API configuration; do not put SQL in the HTTP request.

```json
{
  "id": "get-active-users",
  "endpoint": "/users/search",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "customQuery": "SELECT id, name, email FROM users WHERE active = 1"
}
```

Call it with `GET /api/users/search`. A custom query must be a non-empty SQL string. When `customQuery` is present, it takes precedence over generated CRUD SQL; fields like `table`, `columns`, and `joins` do not change that SQL. The configured database for the API is still used.

##### Choose how values get into the SQL

Use positional `?` placeholders for request-provided values. Add one matching name to `filters` for each placeholder, in the same left-to-right order. Values are passed to the database as parameters, not pasted into the SQL text.

For `READ`, DAB looks up each name in URL route parameters (`req.params`) first, then in the URL query string (`req.query`). For `CREATE` and `UPDATE`, it looks them up in the JSON request body (`req.body`). The name `filters` is a binding-name list in this mode; DAB does not add generated WHERE clauses.

This supports route-based custom queries such as `/user/:id`:

```json
{
  "id": "get-user",
  "endpoint": "/user/:id",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "customQuery": "SELECT * FROM um_users WHERE id = ?",
  "filters": ["id"]
}
```

Call `GET /api/user/123`; the `id` route parameter is bound to the SQL placeholder. If both a route parameter and a query parameter use the same name, the route parameter takes precedence for placeholder binding.

```json
{
  "id": "find-user-by-email",
  "endpoint": "/users/by-email",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "filters": ["email"],
  "customQuery": "SELECT id, name, email FROM users WHERE email = ?"
}
```

Request: `GET /api/users/by-email?email=ada@example.com`

```json
{
  "id": "update-user-profile",
  "endpoint": "/users/:id/profile",
  "method": "PATCH",
  "type": "CRUD",
  "operation": "UPDATE",
  "filters": ["name", "address", "id"],
  "customQuery": "UPDATE users SET name = ?, address = ? WHERE id = ?",
  "validation": {
    "name": "required|string",
    "address": "required|string",
    "id": "required|number"
  }
}
```

Request: `PATCH /api/users/42/profile` with JSON body `{"name":"Ada","address":"London","id":42}`. The route parameter `:id` is not automatically bound; include `id` in the body (or use a hook to copy it there). For writes, `filters` must name body fields in SQL placeholder order. A placeholder with no corresponding `filters` entry, or a name whose value is missing (`undefined`), causes an execution error. `null`, `0`, and `false` are valid supplied values.

DAB counts `?` placeholders outside quoted strings and SQL comments. It converts those placeholders to `$1`, `$2`, etc. for PostgreSQL; for MySQL they remain `?`. Use `?` in the config for both supported database types.

##### Use automatic READ filters instead

If your custom SELECT has no placeholders, you can configure `filters` as the list of result columns that clients may filter. DAB wraps the SELECT and adds parameterized conditions for non-empty matching query parameters. This works best when filter names are columns (or aliases) returned by the SELECT.

```json
{
  "id": "search-users",
  "endpoint": "/users/search",
  "method": "GET",
  "type": "CRUD",
  "operation": "READ",
  "customQuery": "SELECT id, first_name, email FROM users WHERE active = 1",
  "filters": ["email", "first_name"],
  "filterConfig": {
    "first_name": { "operator": "LIKE" }
  },
  "pagination": true
}
```

`GET /api/users/search?email=ada@example.com&first_name=Ada&page=2&limit=25` applies equality on `email`, a contains-style `LIKE` on `first_name`, and pagination. A comma-separated value with the default `=` operator becomes an `IN` filter; for example `?email=a@example.com,b@example.com`. `filterConfig` supports the same operators as [Filters & Pagination](#filters--pagination). `_or` works when `filterConfig.orFields` is configured, as described there.

With `pagination: true`, DAB wraps the custom SELECT and applies `LIMIT` and `OFFSET`. `page` defaults to `1`, `limit` defaults to `10`, and offset is `(page - 1) * limit`. The custom SQL must be a SELECT that is valid as a subquery (without a trailing semicolon; DAB strips one when wrapping). Avoid combining `pagination: true` with placeholder-based custom SQL on non-SELECT statements. With placeholders, DAB still wraps the SQL when pagination is enabled, which is intended for SELECTs.

##### Validate request values

Use the API's normal `validation` object to validate bound values. GET validation reads query parameters; non-GET validation reads the body. A validation rule only checks a value when it is configured; `filters` by itself is not a required-field declaration. Add `required` rules for required bindings. Refer to [Validation Rules](#validation-rules) for available rules.

##### Use custom SQL in a transaction

A transaction can run one custom statement at its top level, or mix custom SQL CRUD steps with other steps. Top-level transaction custom SQL and custom SQL steps can bind `READ` placeholders from route parameters first, then query parameters; a step whose `operation` is `CREATE` or `UPDATE` binds from the request body. All step executions share the transaction connection, and a failure rolls the transaction back.

```json
{
  "id": "reserve-stock",
  "endpoint": "/inventory/reserve",
  "method": "POST",
  "type": "TRANSACTION",
  "steps": [
    {
      "type": "CRUD",
      "operation": "UPDATE",
      "filters": ["quantity", "productId"],
      "customQuery": "UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?"
    },
    {
      "type": "CRUD",
      "operation": "CREATE",
      "table": "reservations",
      "columns": ["product_id", "quantity"]
    }
  ]
}
```

Send `quantity` and `productId` in the body. Transaction steps can also set `pagination`, `filters`, and `filterConfig` when using a SELECT. Top-level transaction custom queries accept the same options on the transaction API object.

##### Safety and troubleshooting

- Keep SQL text static and trusted. Never concatenate or interpolate request values into `customQuery`; use `?` placeholders and `filters` bindings for values.
- Placeholders bind values, not SQL identifiers. For dynamic table names, column names, or sort directions, choose from a fixed allowlist in application code or expose separate configured endpoints.
- The SQL itself is powerful configuration and can read or modify any data allowed by the database account. Use a least-privilege database user.
- When a placeholder count error occurs, count the actual `?` markers outside SQL strings/comments and provide exactly that many names in `filters`.
- When a missing parameter error occurs, check that every configured name exists in `req.query` (GET) or `req.body` (CREATE/UPDATE); spelling and case must match.
- For automatic filters, remove placeholders from the custom SQL and ensure each filter names a selected output column. If you need SQL-specific parameters and extra filters together, put those values in the SQL's placeholders; DAB treats placeholder mode and generated-filter mode as alternatives.

**Operation behaviours:**

| Operation | HTTP | Route params | Body / Query used |
|---|---|---|---|
| `CREATE` | POST | — | `req.body` fields matching `columns` |
| `READ` | GET | — | `req.query` for filters and pagination |
| `UPDATE` | PUT/PATCH | `:id` | `req.body` fields matching `columns` |
| `DELETE` | DELETE | `:id` | — |

---

#### 2. TRANSACTION

Executes multiple CRUD or FUNCTION steps inside a single MySQL transaction. If any step fails, the entire transaction rolls back.

```json
{
  "id": "create-order",
  "endpoint": "/orders",
  "method": "POST",
  "type": "TRANSACTION",
  "steps": [
    {
      "type": "CRUD",
      "operation": "CREATE",
      "table": "orders",
      "columns": ["user_id", "total"],
      "saveAs": "order"
    },
    {
      "type": "CRUD",
      "operation": "CREATE",
      "table": "order_items",
      "columns": ["order_id", "product_id", "qty"],
      "map": {
        "order_id": "$order.id"
      }
    },
    {
      "type": "FUNCTION",
      "handler": "updateInventory"
    }
  ]
}
```

**Step fields:**

| Field | Description |
|---|---|
| `type` | `CRUD` or `FUNCTION` |
| `operation` | For CRUD steps: `CREATE` or `UPDATE` |
| `table` | Target table (CRUD steps) |
| `columns` | Columns to write (CRUD steps) |
| `saveAs` | Key name to store this step's result for use by later steps |
| `map` | Map fields from previous step results using `$stepName.field` syntax |
| `handler` | Hook function name (FUNCTION steps) |
| `customQuery` | Optional SQL string for a CRUD step, executed directly on the transaction connection |
| `pagination` | Optional `true` to paginate a custom SELECT step; page defaults to 1 and limit to 10 |
| `forEach` | Optional request-body property containing an array; run this CRUD step once for each object in that array |

Use `forEach` when one request should insert or update multiple rows in a table. The table and operation remain fixed in configuration; `forEach` only selects which body array supplies the row values. For `UPDATE`, every item must contain an `id`, which is used as the row key. List writable fields in `columns` and omit `id` unless it is also a field you intend to change.

```json
{
  "type": "TRANSACTION",
  "endpoint": "/payments/reconcile",
  "method": "POST",
  "steps": [
    {
      "type": "CRUD",
      "operation": "UPDATE",
      "table": "orders",
      "columns": ["amount"],
      "forEach": "order",
      "saveAs": "updatedOrders"
    },
    {
      "type": "CRUD",
      "operation": "CREATE",
      "table": "payments",
      "columns": ["id", "amount"],
      "forEach": "payment",
      "saveAs": "createdPayments"
    }
  ]
}
```

Send arrays under those configured property names:

```json
{
  "order": [
    { "id": 101, "amount": 25.50 },
    { "id": 102, "amount": 18.00 }
  ],
  "payment": [
    { "id": 501, "amount": 25.50 },
    { "id": 502, "amount": 18.00 }
  ]
}
```

Each row is processed sequentially on the transaction connection. If a row or later step throws an error, the transaction rolls back. A missing/non-array property or a non-object array item is an error; an empty array performs no operations and returns an empty result array. Each `saveAs` value is the array of per-row results. An UPDATE for an ID that matches no row returns `null` for that item, consistent with single-row updates; it does not by itself trigger rollback.

A transaction can also specify `customQuery` at its top level to run one SQL statement in the transaction instead of `steps`. Per-step custom queries run within the same transaction as the other steps:

```json
{
  "type": "TRANSACTION",
  "steps": [
    {
      "type": "CRUD",
      "customQuery": "UPDATE inventory SET quantity = quantity - 1 WHERE id = 42",
      "saveAs": "inventoryUpdate"
    }
  ]
}
```

Transaction-level and step-level custom queries can also specify `filters`, `filterConfig`, and `pagination`; filters are applied to the custom SELECT's result columns unless the custom SQL contains `?` placeholders, in which case `filters` provides the ordered binding names and no generated filters are added.

**Result passing with `map`:**

Use `$saveAsKey.field` to reference results from a previous step:

```json
"map": {
  "order_id": "$order.id"
}
```

This reads `id` from the result saved as `order` and assigns it to `order_id` before the INSERT.

---

#### 3. FUNCTION

Delegates the entire request to a registered hook function. Use this for complex logic that can't be expressed in CRUD config.

```json
{
  "id": "custom-report",
  "name": "Monthly Sales Report",
  "endpoint": "/reports/monthly",
  "method": "GET",
  "type": "FUNCTION",
  "handler": "monthlySalesReport"
}
```

| Field | Description |
|---|---|
| `handler` | Name of the registered hook function to call |

The handler receives `(req)` and must return the data payload. See [Registering Custom Hooks](#registering-custom-hooks).

---

#### 4. CALL_FUNCTION

Calls a **MySQL stored function** (`SELECT myFunc(...)`) and returns its scalar result.

```json
{
  "id": "get-discount",
  "name": "Get Discount",
  "endpoint": "/discount",
  "method": "POST",
  "type": "CALL_FUNCTION",
  "function": "get_discount",
  "params": [
    { "name": "user_id", "source": "body"   },
    { "name": "amount",  "source": "body"   },
    { "name": "promo",   "source": "body"   }
  ],
  "validation": {
    "user_id": "required|number",
    "amount":  "required|number"
  }
}
```

| Field | Description |
|---|---|
| `function` | Name of the MySQL stored function |
| `params` | Ordered array of parameter definitions (see [Parameter Sources](#parameter-sources)) |

**Response shape:**

```json
{
  "success": true,
  "data": { "result": 25.50 },
  "timestamp": "..."
}
```

---

#### 5. CALL_PROCEDURE

Calls a **MySQL stored procedure** (`CALL myProc(...)`) and returns its result sets.

```json
{
  "id": "transfer-funds",
  "name": "Transfer Funds",
  "endpoint": "/transfer",
  "method": "POST",
  "type": "CALL_PROCEDURE",
  "procedure": "transfer_funds",
  "params": [
    { "name": "from_account", "source": "body" },
    { "name": "to_account",   "source": "body" },
    { "name": "amount",       "source": "body" },
    { "name": "currency",     "source": "static", "value": "INR" }
  ],
  "validation": {
    "from_account": "required|number",
    "to_account":   "required|number",
    "amount":       "required|number"
  }
}
```

Procedures with URL params:

```json
{
  "id": "user-stats",
  "endpoint": "/users/:id/stats",
  "method": "GET",
  "type": "CALL_PROCEDURE",
  "procedure": "get_user_stats",
  "params": [
    { "name": "id",     "source": "params" },
    { "name": "period", "source": "query"  }
  ]
}
```

| Field | Description |
|---|---|
| `procedure` | Name of the MySQL stored procedure |
| `params` | Ordered array of parameter definitions |

If the procedure returns a single result set, `data` is that array directly. Multiple result sets are returned as an array of arrays.

---

### Validation Rules

The `validation` object maps field names to pipe-separated rule strings. Rules are evaluated left to right; the first failure stops evaluation for that field.

```json
"validation": {
  "email":    "required|email",
  "age":      "required|number|minValue:18|maxValue:120",
  "username": "required|string|min:3|max:20",
  "role":     "required|in:admin,user,guest",
  "website":  "url",
  "zip":      "pattern:^[0-9]{5}$"
}
```

**Available rules:**

| Rule | Description |
|---|---|
| `required` | Field must be present and non-empty |
| `string` | Must be a string |
| `number` | Must be numeric |
| `boolean` | Must be `true`, `false`, or a boolean |
| `array` | Must be an array |
| `email` | Must match email format |
| `url` | Must be a valid URL |
| `min:N` | String/array length must be at least N |
| `max:N` | String/array length must not exceed N |
| `minValue:N` | Numeric value must be at least N |
| `maxValue:N` | Numeric value must not exceed N |
| `in:a,b,c` | Value must be one of the listed options |
| `pattern:REGEX` | Value must match the regular expression |

Validation errors return HTTP 400:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": 400,
    "details": [
      { "field": "email", "message": "email must be a valid email" }
    ]
  }
}
```

---

### Hooks

Hooks are named functions that run **before** or **after** the main operation. They are registered in the hooks engine and referenced by name in API config.

```json
"hooks": {
  "before": "hashPassword",
  "after": "sendWelcomeEmail"
}
```

**Built-in hooks:**

| Hook Name | Trigger | Behaviour |
|---|---|---|
| `hashPassword` | before | Hashes `req.body.password` using bcrypt (cost 10) |
| `sendWelcomeEmail` | after | Placeholder — logs and returns `{ emailSent: true }` |
| `updateInventory` | after / FUNCTION | Placeholder — logs order data |
| `monthlySalesReport` | FUNCTION | Returns mock monthly sales data |

---

### Filters & Pagination

Applied to `READ` operations via `req.query`.

```json
{
  "filters": ["email", "first_name"],
  "filterConfig": {
    "first_name": { "operator": "LIKE" }
  },
  "pagination": true
}
```

**Filter behaviours:**

| Query value | Behaviour |
|---|---|
| `?email=a@b.com` | `WHERE email = 'a@b.com'` |
| `?email=a@b.com,c@d.com` | `WHERE email IN ('a@b.com', 'c@d.com')` |
| `?first_name=John` (with `LIKE`) | `WHERE first_name LIKE '%John%'` |
| `?_or=John` (with `orFields`) | `WHERE field1 = 'John' OR field2 = 'John'` |

**Pagination query params:**

| Param | Default | Description |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 10 | Rows per page |

```bash
GET /api/users?page=2&limit=25&email=example.com
```

---

### Joins

```json
{
  "table": "um_users",
  "columns": ["um_users.*", "um_user_roles.role_id"],
  "joins": [
    {
      "type": "INNER",
      "table": "um_user_roles",
      "condition": "um_users.id = um_user_roles.user_id"
    }
  ]
}
```

| `type` | SQL |
|---|---|
| `INNER` | `INNER JOIN` |
| `LEFT` | `LEFT JOIN` |
| `RIGHT` | `RIGHT JOIN` |

---

### Parameter Sources

Used in `CALL_FUNCTION` and `CALL_PROCEDURE` to map incoming request data to ordered DB params.

```json
"params": [
  { "name": "user_id",  "source": "body"    },
  { "name": "sort",     "source": "query"   },
  { "name": "id",       "source": "params"  },
  { "name": "token",    "source": "headers" },
  { "name": "currency", "source": "static",  "value": "INR" }
]
```

| `source` | Reads from | Notes |
|---|---|---|
| `body` | `req.body[name]` | POST/PUT JSON body |
| `query` | `req.query[name]` | URL query string |
| `params` | `req.params[name]` | URL path params (`:id`) |
| `headers` | `req.headers[name]` | HTTP headers (lowercased) |
| `static` | `value` field | Hard-coded value, never from request |

Parameters are passed to the DB **in the order they appear** in the array, matching the procedure/function signature.

---

## Environment Variables

| Variable | Description |
|---|---|
| `APP_URL` | Base URL of the application |
| `DB_HOST` | MySQL host |
| `DB_USER` | MySQL username |
| `DB_PASS` | MySQL password |
| `DB_NAME` | MySQL database name |
| `PORT` | Server port (default: `3000`) |

---

## Advanced Usage

### Custom Middleware

Pass middleware to the options object to run it on every route before validation:

```js
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  req.user = decodeToken(token);
  next();
};

const { router } = dynamicApi(config, {
  middleware: authMiddleware   // or an array of middleware functions
});
```

### Registering Custom Hooks

Access the `hooks` object returned by `dabApi` to register your own functions:

```js
const { router, hooks } = dynamicApi(config);

// Register a single hook
hooks.register('sendOrderEmail', async (req, data) => {
  await mailer.send({ to: req.body.email, subject: 'Order confirmed', data });
  return { sent: true };
});

// Register multiple hooks at once
hooks.registerBatch({
  logRequest:    async (req) => { console.log(req.method, req.path); },
  validatePromo: async (req) => { /* promo check logic */ }
});
```

Then reference the hook name in your API config:

```json
"hooks": {
  "after": "sendOrderEmail"
}
```

---

## API Response Format

All responses follow a consistent envelope:

**Success:**

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-06-04T08:00:00.000Z"
}
```

**Validation error (400):**

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": 400,
    "details": [
      { "field": "email", "message": "email must be a valid email" }
    ]
  },
  "timestamp": "2026-06-04T08:00:00.000Z"
}
```

---

## Health Check

```bash
GET /health
```

```json
{
  "status": "ok",
  "message": "dynamic-api-js is running"
}
```

---

## Complete api.json Example

The following covers all five API types in one file:

```json
{
  "version": "1.0",
  "basePath": "/api",
  "apis": [

    // ── CRUD: CREATE ─────────────────────────────────────────────────────────
    {
      "id": "create-user",
      "name": "Create User",
      "endpoint": "/users",
      "method": "POST",
      "type": "CRUD",
      "operation": "CREATE",
      "table": "users",
      "columns": ["name", "email", "password"],
      "validation": {
        "name": "required|string|min:3",
        "email": "required|email",
        "password": "required|string|min:8"
      },
      "hooks": {
        "before": "hashPassword",
        "after": "sendWelcomeEmail"
      }
    },

    // ── CRUD: READ with filters, joins, pagination ────────────────────────────
    {
      "id": "get-users-with-roles",
      "endpoint": "/users-with-roles",
      "method": "GET",
      "type": "CRUD",
      "operation": "READ",
      "table": "um_users",
      "columns": ["um_users.*", "um_user_roles.role_id"],
      "joins": [
        {
          "type": "INNER",
          "table": "um_user_roles",
          "condition": "um_users.id = um_user_roles.user_id"
        }
      ],
      "filters": ["email", "first_name"],
      "filterConfig": {
        "first_name": { "operator": "LIKE" }
      },
      "pagination": true
    },

    // ── CRUD: DELETE ──────────────────────────────────────────────────────────
    {
      "id": "delete-user",
      "name": "Delete User",
      "endpoint": "/user/delete/:id",
      "method": "DELETE",
      "type": "CRUD",
      "operation": "DELETE",
      "table": "um_users"
    },

    // ── TRANSACTION ───────────────────────────────────────────────────────────
    {
      "id": "create-order",
      "name": "Create Order",
      "endpoint": "/orders",
      "method": "POST",
      "type": "TRANSACTION",
      "steps": [
        {
          "type": "CRUD",
          "operation": "CREATE",
          "table": "orders",
          "columns": ["user_id", "total"],
          "saveAs": "order"
        },
        {
          "type": "CRUD",
          "operation": "CREATE",
          "table": "order_items",
          "columns": ["order_id", "product_id", "qty"],
          "map": { "order_id": "$order.id" }
        },
        {
          "type": "FUNCTION",
          "handler": "updateInventory"
        }
      ]
    },

    // ── FUNCTION ──────────────────────────────────────────────────────────────
    {
      "id": "monthly-report",
      "name": "Monthly Sales Report",
      "endpoint": "/reports/monthly",
      "method": "GET",
      "type": "FUNCTION",
      "handler": "monthlySalesReport"
    },

    // ── CALL_FUNCTION (MySQL stored function) ─────────────────────────────────
    {
      "id": "get-discount",
      "name": "Get Discount",
      "endpoint": "/discount",
      "method": "POST",
      "type": "CALL_FUNCTION",
      "function": "get_discount",
      "params": [
        { "name": "user_id", "source": "body" },
        { "name": "amount",  "source": "body" },
        { "name": "promo",   "source": "body" }
      ],
      "validation": {
        "user_id": "required|number",
        "amount":  "required|number"
      }
    },

    // ── CALL_PROCEDURE (MySQL stored procedure, static param) ─────────────────
    {
      "id": "transfer-funds",
      "name": "Transfer Funds",
      "endpoint": "/transfer",
      "method": "POST",
      "type": "CALL_PROCEDURE",
      "procedure": "transfer_funds",
      "params": [
        { "name": "from_account", "source": "body" },
        { "name": "to_account",   "source": "body" },
        { "name": "amount",       "source": "body" },
        { "name": "currency",     "source": "static", "value": "INR" }
      ],
      "validation": {
        "from_account": "required|number",
        "to_account":   "required|number",
        "amount":       "required|number"
      }
    },

    // ── CALL_PROCEDURE (URL param + query param) ──────────────────────────────
    {
      "id": "user-stats",
      "name": "User Statistics",
      "endpoint": "/users/:id/stats",
      "method": "GET",
      "type": "CALL_PROCEDURE",
      "procedure": "get_user_stats",
      "params": [
        { "name": "id",     "source": "params" },
        { "name": "period", "source": "query"  }
      ]
    }

  ]
}
```
