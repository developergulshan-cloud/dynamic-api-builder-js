/**
 * Error Handler
 * Centralized error handling middleware
 */

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  // Default error response
  let status = err.status || 500;
  let message = err.message || 'Internal Server Error';
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
    details = err.errors;
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    message = 'Duplicate entry';
  } else if (err.code === 'ER_NO_SUCH_TABLE') {
    status = 500;
    message = 'Database table not found';
  }

  // Send error response
  res.status(status).json({
    success: false,
    error: {
      message,
      code: status,
      details
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;