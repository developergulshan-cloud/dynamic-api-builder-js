/**
 * DAB-API Module - Example Usage
 * This file shows various ways to use the DAB-API module
 */

const express = require('express');
const dabApi = require('./index');

// =============================================================================
// EXAMPLE 1: Basic Setup
// =============================================================================

function example1_BasicSetup() {
  const app = express();
  app.use(express.json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      {
        id: 'create-user',
        endpoint: '/users',
        method: 'POST',
        type: 'CRUD',
        operation: 'CREATE',
        table: 'users',
        columns: ['name', 'email', 'password'],
        validation: {
          name: 'required|string|min:3',
          email: 'required|email',
          password: 'required|string|min:8'
        }
      },
      // {
      //   id: 'get-users',
      //   endpoint: '/users',
      //   method: 'GET',
      //   type: 'CRUD',
      //   operation: 'READ',
      //   table: 'users',
      //   filters: ['name', 'email'],
      //   pagination: true
      // }
    ]
  };

  const { router } = dabApi(config);
  app.use('/api', router);

  app.listen(3000, () => {
    console.log('Example 1: Basic setup running on port 3000');
  });
}

// =============================================================================
// EXAMPLE 2: With Custom Middleware
// =============================================================================

function example2_WithMiddleware() {
  const app = express();
  app.use(express.json());

  // Custom auth middleware
  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Add user info to request
    req.user = { id: 1, email: 'user@example.com' };
    next();
  };

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      {
        id: 'get-profile',
        endpoint: '/profile',
        method: 'GET',
        type: 'CRUD',
        operation: 'READ',
        table: 'users'
      }
    ]
  };

  const { router } = dabApi(config, {
    middleware: authMiddleware
  });

  app.use('/api', router);

  app.listen(3001, () => {
    console.log('Example 2: With middleware running on port 3001');
  });
}

// =============================================================================
// EXAMPLE 3: With Custom Hooks
// =============================================================================

function example3_WithCustomHooks() {
  const app = express();
  app.use(express.json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      {
        id: 'create-user',
        endpoint: '/users',
        method: 'POST',
        type: 'CRUD',
        operation: 'CREATE',
        table: 'users',
        columns: ['name', 'email', 'password'],
        hooks: {
          before: 'hashPassword',
          after: 'sendWelcomeEmail'
        }
      }
    ]
  };

  const { router, hooks } = dabApi(config);

  // Register custom hooks
  hooks.register('sendNotification', async (req, data) => {
    console.log('Sending notification for:', data);
    // Implement notification logic
    return { notificationSent: true };
  });

  hooks.register('validateStock', async (req) => {
    const productId = req.body.product_id;
    const quantity = req.body.quantity;
    // Check if stock is available
    console.log(`Validating stock for product ${productId}, qty ${quantity}`);
  });

  app.use('/api', router);

  app.listen(3002, () => {
    console.log('Example 3: With custom hooks running on port 3002');
  });
}

// =============================================================================
// EXAMPLE 4: Transaction Example
// =============================================================================

function example4_Transactions() {
  const app = express();
  app.use(express.json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      {
        id: 'create-order',
        endpoint: '/orders',
        method: 'POST',
        type: 'TRANSACTION',
        steps: [
          {
            type: 'CRUD',
            operation: 'CREATE',
            table: 'orders',
            columns: ['user_id', 'total'],
            saveAs: 'order'
          },
          {
            type: 'CRUD',
            operation: 'CREATE',
            table: 'order_items',
            columns: ['order_id', 'product_id', 'quantity', 'price'],
            map: {
              order_id: '$order.id'
            }
          },
          {
            type: 'FUNCTION',
            handler: 'updateInventory'
          }
        ]
      }
    ]
  };

  const { router, hooks } = dabApi(config);

  // Implement updateInventory hook
  hooks.register('updateInventory', async (req, data) => {
    console.log('Updating inventory for order:', data.order);
    // Update inventory logic here
    return { inventoryUpdated: true };
  });

  app.use('/api', router);

  app.listen(3003, () => {
    console.log('Example 4: Transactions running on port 3003');
  });
}

// =============================================================================
// EXAMPLE 5: Custom Function Handler
// =============================================================================

function example5_CustomFunctions() {
  const app = express();
  app.use(express.json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      {
        id: 'sales-report',
        endpoint: '/reports/sales',
        method: 'GET',
        type: 'FUNCTION',
        handler: 'generateSalesReport'
      },
      {
        id: 'dashboard',
        endpoint: '/dashboard',
        method: 'GET',
        type: 'FUNCTION',
        handler: 'getDashboard'
      }
    ]
  };

  const { router, hooks, queryBuilder } = dabApi(config);

  // Custom report generator
  hooks.register('generateSalesReport', async (req) => {
    const { startDate, endDate } = req.query;
    
    // Use query builder for custom queries
    const sales = await queryBuilder.execute(
      'SELECT SUM(total) as total, COUNT(*) as count FROM orders WHERE created_at BETWEEN ? AND ?',
      [startDate, endDate]
    );

    return {
      period: { startDate, endDate },
      totalSales: sales[0].total,
      orderCount: sales[0].count
    };
  });

  // Dashboard data
  hooks.register('getDashboard', async (req) => {
    const users = await queryBuilder.execute('SELECT COUNT(*) as count FROM users');
    const orders = await queryBuilder.execute('SELECT COUNT(*) as count FROM orders');
    
    return {
      totalUsers: users[0].count,
      totalOrders: orders[0].count,
      timestamp: new Date()
    };
  });

  app.use('/api', router);

  app.listen(3004, () => {
    console.log('Example 5: Custom functions running on port 3004');
  });
}

// =============================================================================
// EXAMPLE 6: Complete E-commerce API
// =============================================================================

function example6_CompleteEcommerce() {
  const app = express();
  app.use(express.json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'ecommerce'
    },
    apis: [
      // Products
      {
        id: 'list-products',
        endpoint: '/products',
        method: 'GET',
        type: 'CRUD',
        operation: 'READ',
        table: 'products',
        filters: ['category', 'name', 'price_min', 'price_max'],
        pagination: true
      },
      {
        id: 'get-product',
        endpoint: '/products/:id',
        method: 'GET',
        type: 'CRUD',
        operation: 'READ',
        table: 'products'
      },
      // Cart
      {
        id: 'add-to-cart',
        endpoint: '/cart',
        method: 'POST',
        type: 'CRUD',
        operation: 'CREATE',
        table: 'cart_items',
        columns: ['user_id', 'product_id', 'quantity'],
        validation: {
          product_id: 'required|number',
          quantity: 'required|number|minValue:1'
        }
      },
      // Checkout
      {
        id: 'checkout',
        endpoint: '/checkout',
        method: 'POST',
        type: 'TRANSACTION',
        steps: [
          {
            type: 'CRUD',
            operation: 'CREATE',
            table: 'orders',
            columns: ['user_id', 'total', 'shipping_address'],
            saveAs: 'order'
          },
          {
            type: 'CRUD',
            operation: 'CREATE',
            table: 'order_items',
            columns: ['order_id', 'product_id', 'quantity', 'price'],
            map: { order_id: '$order.id' }
          },
          {
            type: 'FUNCTION',
            handler: 'processPayment'
          },
          {
            type: 'FUNCTION',
            handler: 'sendOrderConfirmation'
          }
        ]
      }
    ]
  };

  const { router, hooks } = dabApi(config);

  // Payment processing
  hooks.register('processPayment', async (req, data) => {
    console.log('Processing payment for order:', data.order.id);
    // Integrate with payment gateway
    return { paymentId: 'pay_123', status: 'success' };
  });

  // Order confirmation
  hooks.register('sendOrderConfirmation', async (req, data) => {
    console.log('Sending order confirmation email');
    // Send email
    return { emailSent: true };
  });

  app.use('/api', router);

  // Error handler
  const { response } = dabApi(config);
  app.use(response.errorHandler());

  app.listen(3005, () => {
    console.log('Example 6: Complete e-commerce API running on port 3005');
  });
}

// =============================================================================
// EXAMPLE 7: Load Configuration from File
// =============================================================================

function example7_LoadFromFile() {
  const app = express();
  app.use(express.json());
  const fs = require('fs');
  const path = require('path');

  // Load configuration from JSON file
  const configPath = path.join(__dirname, 'config', 'apis.json');
  const configFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const config = {
    database: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'mydb'
    },
    apis: configFile.apis
  };

  const { router } = dabApi(config);
  app.use('/api', router);

  app.listen(3006, () => {
    console.log('Example 7: Load from file running on port 3006');
  });
}

// =============================================================================
// EXAMPLE 8: Stored Function & Stored Procedure
// =============================================================================

/**
 * Demonstrates CALL_FUNCTION and CALL_PROCEDURE API types.
 *
 * Parameters are declared in the config under "params" as an ordered array.
 * Each entry has:
 *   name   – the key to look up in the request source
 *   source – "body" | "query" | "params" | "headers" | "static"
 *   value  – used only when source is "static"
 *
 * MySQL prerequisites (run once in your DB):
 *
 *   CREATE FUNCTION get_discount(uid INT, amount DECIMAL(10,2), promo VARCHAR(20))
 *     RETURNS DECIMAL(10,2)
 *     DETERMINISTIC
 *   BEGIN
 *     IF promo = 'SAVE10' THEN RETURN amount * 0.10;
 *     ELSE RETURN 0;
 *     END IF;
 *   END;
 *
 *   CREATE PROCEDURE transfer_funds(
 *     IN from_account INT, IN to_account INT,
 *     IN amount DECIMAL(10,2), IN currency VARCHAR(10)
 *   )
 *   BEGIN
 *     UPDATE accounts SET balance = balance - amount WHERE id = from_account;
 *     UPDATE accounts SET balance = balance + amount WHERE id = to_account;
 *     SELECT 'transfer_complete' AS status, currency AS currency;
 *   END;
 */
function example8_StoredFunctionAndProcedure() {
  const app = require('express')();
  app.use(require('express').json());

  const config = {
    database: {
      host: 'localhost',
      user: 'root',
      password: 'password',
      database: 'mydb'
    },
    apis: [
      // ── CALL_FUNCTION ─────────────────────────────────────────────────────
      // POST /api/discount  { "user_id": 5, "amount": 200, "promo": "SAVE10" }
      // → { "success": true, "data": { "result": 20 } }
      {
        id: 'get-discount',
        name: 'Get Discount (Stored Function)',
        endpoint: '/discount',
        method: 'POST',
        type: 'CALL_FUNCTION',
        function: 'get_discount',
        params: [
          { name: 'user_id', source: 'body'   },
          { name: 'amount',  source: 'body'   },
          { name: 'promo',   source: 'body'   }
        ],
        validation: {
          user_id: 'required|number',
          amount:  'required|number'
        }
      },

      // ── CALL_PROCEDURE ────────────────────────────────────────────────────
      // POST /api/transfer  { "from_account": 1, "to_account": 2, "amount": 500 }
      // "currency" is injected as a static value from the config — no client input needed
      // → { "success": true, "data": [{ status: "transfer_complete", currency: "INR" }] }
      {
        id: 'transfer-funds',
        name: 'Transfer Funds (Stored Procedure)',
        endpoint: '/transfer',
        method: 'POST',
        type: 'CALL_PROCEDURE',
        procedure: 'transfer_funds',
        params: [
          { name: 'from_account', source: 'body'   },
          { name: 'to_account',   source: 'body'   },
          { name: 'amount',       source: 'body'   },
          { name: 'currency',     source: 'static', value: 'INR' }   // hard-coded
        ],
        validation: {
          from_account: 'required|number',
          to_account:   'required|number',
          amount:       'required|number'
        }
      },

      // ── Mixed sources: URL param + query string ───────────────────────────
      // GET /api/users/42/stats?period=monthly
      // → calls get_user_stats(42, 'monthly')
      {
        id: 'user-stats',
        name: 'User Statistics (Stored Procedure)',
        endpoint: '/users/:id/stats',
        method: 'GET',
        type: 'CALL_PROCEDURE',
        procedure: 'get_user_stats',
        params: [
          { name: 'id',     source: 'params' },
          { name: 'period', source: 'query'  }
        ]
      }
    ]
  };

  const { router } = dabApi(config);
  app.use('/api', router);

  app.listen(3007, () => {
    console.log('Example 8: Stored functions & procedures running on port 3007');
  });
}

// =============================================================================
// Run examples (uncomment to test)
// =============================================================================

// example1_BasicSetup();
// example2_WithMiddleware();
// example3_WithCustomHooks();
// example4_Transactions();
// example5_CustomFunctions();
// example6_CompleteEcommerce();
// example7_LoadFromFile();

// Export for testing
module.exports = {
  example1_BasicSetup,
  example2_WithMiddleware,
  example3_WithCustomHooks,
  example4_Transactions,
  example5_CustomFunctions,
  example6_CompleteEcommerce,
  example7_LoadFromFile,
  example8_StoredFunctionAndProcedure
};