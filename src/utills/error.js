/**
 * Error Handler
 * Centralized error handling middleware
 */
const NODE_ENV = process.env.NODE_ENV || 'development';

class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function mapDbError(err) {
  // Postgres numeric codes and MySQL string codes
  const code = err && err.code;
  const detail = err && (err.detail || err.sqlMessage || err.message);

  switch (code) {
    // Unique violation
    case '23505': // Postgres
    case 'ER_DUP_ENTRY': // MySQL
      return new ApiError('Duplicate entry', 409, { detail });

    // Foreign key violation
    case '23503':
    case 'ER_NO_REFERENCED_ROW_2':
      return new ApiError('Foreign key constraint violation', 409, { detail });

    // Not null violation
    case '23502':
    case 'ER_BAD_NULL_ERROR':
      return new ApiError('Missing required field', 400, { detail });

    // Invalid text representation / bad input
    case '22P02':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      return new ApiError('Invalid input', 400, { detail });

    // Table or relation not found
    case '42P01':
    case 'ER_NO_SUCH_TABLE':
      return new ApiError('Database table not found', 500, { detail });

    default:
      return new ApiError('Database error', 500, { detail });
  }
}

/**
 * Express error-handling middleware
 */
function errorHandler(err, req, res, next) {
  // Log full error server-side
  console.error('❌ Error:', err && err.message);
  if (NODE_ENV !== 'production') console.error(err && err.stack);

  // Normalize DB errors
  let apiErr = err instanceof ApiError ? err : null;
  if (!apiErr && err && err.code) {
    apiErr = mapDbError(err);
  }

  if (!apiErr) {
    if (err && err.name === 'ValidationError') {
      apiErr = new ApiError('Validation Error', 400, err.errors || null);
    } else if (err && err.name === 'UnauthorizedError') {
      apiErr = new ApiError('Unauthorized', 401, null);
    } else {
      apiErr = new ApiError(err && err.message ? err.message : 'Internal Server Error', err.status || 500, null);
    }
  }

  const payload = {
    success: false,
    error: {
      message: apiErr.message,
      code: apiErr.status,
      details: NODE_ENV === 'production' ? undefined : apiErr.details || (err && err.stack)
    },
    timestamp: new Date().toISOString()
  };

  res.status(apiErr.status).json(payload);
}

// Export middleware and helpers. Keep default export compatible with existing imports.
errorHandler.ApiError = ApiError;
errorHandler.mapDbError = mapDbError;

module.exports = errorHandler;