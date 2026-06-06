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

Access the `hooks` object returned by `lcapApi` to register your own functions:

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