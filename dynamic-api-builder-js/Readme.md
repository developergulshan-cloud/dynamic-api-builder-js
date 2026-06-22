# dynamic-api-builder-js

> **Configuration-driven REST API generator for Node.js** — define your endpoints in JSON, get a fully working Express API instantly.

[![npm version](https://img.shields.io/badge/npm-1.0.0-blue)](https://www.npmjs.com/package/dynamic-api-builder-js)
[![license](https://img.shields.io/badge/license-ISC-green)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Database Config](#database-config)
  - [API Config](#api-config)
- [API Types](#api-types)
  - [CRUD](#crud)
  - [TRANSACTION](#transaction)
  - [CALL\_FUNCTION](#call_function)
  - [CALL\_PROCEDURE](#call_procedure)
  - [FUNCTION](#function)
- [Hooks](#hooks)
- [Validation](#validation)
- [Filters & Pagination](#filters--pagination)
- [Joins](#joins)
- [Response Format](#response-format)
- [Advanced Usage](#advanced-usage)
- [API Reference](#api-reference)

---

## Overview

`dynamic-api-builder-js` (DAB) eliminates the boilerplate of writing Express routes, SQL queries, and request validation by hand. You declare your API endpoints as a JSON config, and DAB registers them on an Express router automatically — including CRUD operations, multi-step transactions, database function/procedure calls, and fully custom handlers.

**Supports MySQL and PostgreSQL.**

---

## Installation

```bash
npm install dynamic-api-builder-js
```

**Peer dependencies** (install separately):

```bash
# For MySQL
npm install mysql2

# For PostgreSQL
npm install pg
```

---

## Quick Start

```js
const express = require('express');
const dabApi = require('dynamic-api-builder-js');

const app = express();
app.use(express.json());

const { router } = dabApi({
  database: {
    type: 'mysql',       // 'mysql' | 'postgres'
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'mydb',
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
      pagination: true,
    },
    {
      id: 'create-user',
      endpoint: '/users',
      method: 'POST',
      type: 'CRUD',
      operation: 'CREATE',
      table: 'users',
      columns: ['name', 'email', 'password'],
    },
  ],
});

app.use('/api', router);
app.listen(3000, () => console.log('Server running on port 3000'));
```

---

## Configuration

### Database Config

Pass a `database` object at the top level of your config. DAB creates and manages the connection pool for you.

| Field             | Type     | Default       | Description                        |
|-------------------|----------|---------------|------------------------------------|
| `type`            | `string` | `"mysql"`     | `"mysql"` or `"postgres"`          |
| `host`            | `string` | `"localhost"` | Database host                      |
| `port`            | `number` | `3306`        | Database port                      |
| `user`            | `string` | `"root"`      | Database user                      |
| `password`        | `string` | `""`          | Database password                  |
| `database`        | `string` | `""`          | Database/schema name               |
| `connectionLimit` | `number` | `10`          | Max connections in the pool        |

### API Config

Each entry in the `apis` array describes a single route.

| Field        | Type     | Required | Description                                              |
|--------------|----------|----------|----------------------------------------------------------|
| `id`         | `string` | No       | Identifier used in logs and warnings                     |
| `endpoint`   | `string` | Yes      | Express route path (e.g. `/users/:id`)                   |
| `method`     | `string` | Yes      | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, etc.        |
| `type`       | `string` | Yes      | API type (see [API Types](#api-types))                   |
| `validation` | `object` | No       | Validation rules (see [Validation](#validation))         |
| `hooks`      | `object` | No       | `before` / `after` hook names (see [Hooks](#hooks))      |

---

## API Types

### CRUD

Handles standard Create, Read, Update, Delete operations against a single table.

```js
{
  id: 'get-user',
  endpoint: '/users/:id',
  method: 'GET',
  type: 'CRUD',
  operation: 'READ',       // 'CREATE' | 'READ' | 'UPDATE' | 'DELETE'
  table: 'users',
  columns: ['id', 'name', 'email'],
  filters: ['status', 'role'],        // query params used as WHERE filters
  pagination: true,                   // enables ?page=&limit= query params
  joins: [                            // optional JOIN clauses
    {
      type: 'LEFT',                   // 'INNER' | 'LEFT' | 'RIGHT'
      table: 'roles',
      condition: 'users.role_id = roles.id'
    }
  ],
  filterConfig: {
    name: { operator: 'LIKE' },       // override filter operator
    orFields: ['name', 'email']       // fields matched by ?_or= query param
  }
}
```

**Operations:**

| Operation  | HTTP Method | Description                      |
|------------|-------------|----------------------------------|
| `READ`     | `GET`       | Fetch rows; supports filter/pagination |
| `CREATE`   | `POST`      | Insert a new row                 |
| `UPDATE`   | `PUT/PATCH` | Update row by `:id`              |
| `DELETE`   | `DELETE`    | Delete row by `:id`              |

---

### TRANSACTION

Executes multiple database steps as an atomic transaction. Steps run in order; each step's result is passed to the next via `map`.

```js
{
  id: 'transfer-funds',
  endpoint: '/transfer',
  method: 'POST',
  type: 'TRANSACTION',
  steps: [
    {
      operation: 'CREATE',
      table: 'ledger',
      columns: ['account_id', 'amount', 'type'],
    },
    {
      operation: 'UPDATE',
      table: 'balances',
      columns: ['balance'],
      map: {
        // Map a value from a previous step's result
        // "$stepResultKey.fieldName"
        balance: '$0.amount'
      }
    }
  ]
}
```

A step can also use a custom handler instead of a CRUD operation:

```js
{ handler: 'myCustomHookName' }
```

---

### CALL\_FUNCTION

Calls a database scalar function and returns its result.

```js
{
  id: 'get-discount',
  endpoint: '/discount',
  method: 'GET',
  type: 'CALL_FUNCTION',
  function: 'calculate_discount',     // DB function name
  params: [
    { name: 'user_id',   source: 'query'  },
    { name: 'coupon',    source: 'body'   },
    { name: 'currency',  source: 'static', value: 'INR' }
  ]
}
```

**Parameter sources:**

| Source    | Reads from                    |
|-----------|-------------------------------|
| `body`    | `req.body[name]`              |
| `query`   | `req.query[name]`             |
| `params`  | `req.params[name]`            |
| `headers` | `req.headers[name]`           |
| `static`  | Hardcoded `value` in config   |

---

### CALL\_PROCEDURE

Calls a stored procedure. Returns a single result set or an array of result sets when the procedure returns multiple.

```js
{
  id: 'sync-inventory',
  endpoint: '/inventory/sync',
  method: 'POST',
  type: 'CALL_PROCEDURE',
  procedure: 'sync_inventory_proc',
  params: [
    { name: 'warehouse_id', source: 'body' },
    { name: 'triggered_by', source: 'static', value: 'api' }
  ]
}
```

---

### FUNCTION

Executes a fully custom JavaScript handler — useful for complex logic that doesn't fit the other types.

```js
const { hooks } = dabApi({ ... });

hooks.register('myHandler', async (req) => {
  // any custom logic
  return { message: 'done' };
});

// In your API config:
{
  id: 'custom-endpoint',
  endpoint: '/custom',
  method: 'POST',
  type: 'FUNCTION',
  handler: 'myHandler'
}
```

---

## Hooks

Hooks let you run code **before** or **after** the main operation executes — great for password hashing, logging, or enriching response data.

```js
const { hooks } = dabApi(config);

// Register a hook
hooks.register('hashPassword', async (req) => {
  if (req.body.password) {
    req.body.password = await bcrypt.hash(req.body.password, 10);
  }
});

// Use in API config
{
  type: 'CRUD',
  operation: 'CREATE',
  table: 'users',
  columns: ['name', 'email', 'password'],
  hooks: {
    before: 'hashPassword',   // runs before the DB operation
    after: 'sendWelcomeEmail' // runs after, receives (req, result)
  }
}
```

**Built-in hooks** (registered automatically):

| Hook Name        | Description                                     |
|------------------|-------------------------------------------------|
| `hashPassword`   | Hashes `req.body.password` using bcrypt before saving |

**Hook methods on `DabHooks`:**

```js
hooks.register('name', fn)           // register a single hook
hooks.registerBatch({ name: fn })    // register multiple at once
hooks.has('name')                    // check if a hook exists → boolean
hooks.remove('name')                 // unregister a hook
```

---

## Validation

Add a `validation` object to any API config to enforce rules on request fields.

```js
{
  type: 'CRUD',
  operation: 'CREATE',
  table: 'users',
  columns: ['name', 'email'],
  validation: {
    name:  { required: true, minLength: 2, maxLength: 100 },
    email: { required: true, type: 'email' },
    age:   { type: 'number', min: 18 },
  }
}
```

Validation failures return HTTP `400` with a structured error:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": 400,
    "details": [ ... ]
  },
  "timestamp": "2026-06-22T10:00:00.000Z"
}
```

---

## Filters & Pagination

### Filters

List field names in the `filters` array. DAB maps them from query parameters to SQL `WHERE` clauses automatically.

```
GET /users?status=active&role=admin
```

Use `filterConfig` to customize operators:

```js
filterConfig: {
  name:     { operator: 'LIKE' },   // WHERE name LIKE '%value%'
  age:      { operator: '>=' },
  orFields: ['name', 'email']       // WHERE (name = ? OR email = ?)
}
```

Pass comma-separated values for an `IN` clause:

```
GET /users?role=admin,manager
```

### Pagination

Enable with `pagination: true`. Control via query params:

```
GET /users?page=2&limit=20
```

---

## Joins

```js
joins: [
  {
    type: 'LEFT',    // 'INNER' | 'LEFT' | 'RIGHT'
    table: 'roles',
    condition: 'users.role_id = roles.id'
  }
]
```

---

## Response Format

All responses follow a consistent structure.

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-06-22T10:00:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Duplicate entry",
    "code": 409,
    "details": null
  },
  "timestamp": "2026-06-22T10:00:00.000Z"
}
```

DAB automatically maps common database error codes (duplicate entry, foreign key violation, null constraint, missing table) to appropriate HTTP status codes.

---

## Advanced Usage

### Attaching middleware

Pass a `middleware` option to `dabApi()` to run middleware before every registered route:

```js
const { router } = dabApi(config, {
  middleware: [authMiddleware, rateLimitMiddleware]
});
```

### Accessing sub-modules

`dabApi()` returns an object with all internal modules exposed:

```js
const { router, validator, executor, queryBuilder, hooks, response } = dabApi(config);
```

### Running raw queries

```js
const { queryBuilder } = dabApi(config);

await queryBuilder.initPool();
const rows = await queryBuilder.execute('SELECT * FROM users WHERE id = ?', [1]);
```

### Transactions

```js
await queryBuilder.beginTransaction();
try {
  await queryBuilder.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]);
  await queryBuilder.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]);
  await queryBuilder.commitTransaction();
} catch (err) {
  await queryBuilder.rollbackTransaction();
  throw err;
}
```

---

## API Reference

### `dabApi(config, options?)`

Main entry point. Returns `{ router, validator, executor, queryBuilder, hooks, response }`.

| Param              | Type       | Description                              |
|--------------------|------------|------------------------------------------|
| `config.database`  | `object`   | DB connection config (optional if pool already configured) |
| `config.apis`      | `array`    | Array of API definitions (required)      |
| `options.middleware` | `fn\|fn[]` | Middleware to run before every route    |

### `DabQueryBuilder`

| Method                          | Description                              |
|---------------------------------|------------------------------------------|
| `configure(config)`             | Set DB config and initialize pool        |
| `initPool()`                    | Open and verify the connection pool      |
| `execute(sql, params)`          | Run a raw parameterized query            |
| `beginTransaction()`            | Start a DB transaction                   |
| `commitTransaction()`           | Commit the active transaction            |
| `rollbackTransaction()`         | Roll back the active transaction         |
| `closePool()`                   | Drain and close the pool                 |

### `DabHooks`

| Method                        | Description                              |
|-------------------------------|------------------------------------------|
| `register(name, fn)`          | Register a hook function                 |
| `registerBatch(obj)`          | Register multiple hooks                  |
| `execute(name, req, data?)`   | Execute a registered hook                |
| `has(name)`                   | Check if a hook is registered            |
| `remove(name)`                | Unregister a hook                        |

---

## Author

**Gulshan Marandi**

---

## License

ISC