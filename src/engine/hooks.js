/**
 * DAB Hooks Module
 * Manages before/after hooks and custom functions
 */

const bcrypt = require('bcryptjs');

class DabHooks {
    constructor() {
        // Built-in hooks
        this.hooks = {
            hashPassword: this.hashPassword.bind(this),
            sendWelcomeEmail: this.sendWelcomeEmail.bind(this),
            updateInventory: this.updateInventory.bind(this),
            monthlySalesReport: this.monthlySalesReport.bind(this)
        };
    }

    /**
     * Execute a hook by name
     */
    async execute(hookName, req, data) {
        const hook = this.hooks[hookName];

        if (!hook) {
            console.warn(`⚠️  DAB: Hook not found: ${hookName}`);
            return null;
        }

        try {
            return await hook(req, data);
        } catch (error) {
            console.error(`❌ DAB: Error executing hook ${hookName}:`, error.message);
            throw error;
        }
    }

    /**
     * Register a custom hook
     */
    register(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('Hook must be a function');
        }
        this.hooks[name] = fn;
        console.log(`✅ DAB: Registered hook: ${name}`);
    }

    /**
     * Register multiple hooks
     */
    registerBatch(hooks) {
        Object.entries(hooks).forEach(([name, fn]) => {
            this.register(name, fn);
        });
    }

    /**
     * Check if hook exists
     */
    has(name) {
        return !!this.hooks[name];
    }

    /**
     * Remove a hook
     */
    unregister(name) {
        delete this.hooks[name];
    }

    // Built-in hooks

    /**
     * Hash password before saving
     */
    async hashPassword(req) {
        if (req.body.password) {
            const salt = await bcrypt.genSalt(10);
            req.body.password = await bcrypt.hash(req.body.password, salt);
        }
    }

    /**
     * Send welcome email (placeholder)
     */
    async sendWelcomeEmail(req, data) {
        console.log(`📧 DAB: Sending welcome email to: ${data.email || req.body.email}`);
        // Integrate with email service (SendGrid, AWS SES, etc.)
        return { emailSent: true };
    }

    /**
     * Update inventory (placeholder)
     */
    async updateInventory(req, data) {
        console.log('📦 DAB: Updating inventory for order:', data);
        // Implement inventory update logic
        return { inventoryUpdated: true };
    }

    /**
     * Generate monthly sales report (placeholder)
     */
    async monthlySalesReport(req) {
        console.log('📊 DAB: Generating monthly sales report');

        // Mock report data
        const mockReport = {
            month: new Date().toISOString().slice(0, 7),
            totalSales: 125000,
            orderCount: 450,
            averageOrderValue: 277.78,
            topProducts: [
                { id: 1, name: 'Product A', sales: 35000 },
                { id: 2, name: 'Product B', sales: 28000 },
                { id: 3, name: 'Product C', sales: 22000 }
            ]
        };

        return mockReport;
    }
}

// Export singleton instance
module.exports = new DabHooks();