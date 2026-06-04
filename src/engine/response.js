/**
 * LCAP Response Module
 * Standardizes API responses
 */

class LcapResponse {
    /**
     * Format success response
     */
    static success(data, message = 'Success') {
        return {
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format error response
     */
    static error(message, code = 500, details = null) {
        return {
            success: false,
            error: {
                message,
                code,
                details
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format paginated response
     */
    static paginated(data, page, limit, total) {
        return {
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format validation error response
     */
    static validationError(errors) {
        return {
            success: false,
            error: {
                message: 'Validation failed',
                code: 400,
                details: errors
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Express middleware for error handling
     */
    static errorHandler() {
        return (err, req, res, next) => {
            console.error('❌ LCAP Error:', err.message);
            console.error(err.stack);

            let status = err.status || 500;
            let message = err.message || 'Internal Server Error';
            let details = null;

            // Handle specific error types
            if (err.name === 'ValidationError') {
                status = 400;
                message = 'Validation Error';
                details = err.errors;
            } else if (err.code === 'ER_DUP_ENTRY') {
                status = 409;
                message = 'Duplicate entry';
            } else if (err.code === 'ER_NO_SUCH_TABLE') {
                status = 500;
                message = 'Database table not found';
            }

            res.status(status).json(this.error(message, status, details));
        };
    }
}

module.exports = LcapResponse;