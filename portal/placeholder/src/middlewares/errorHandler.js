// Generic error handler to avoid leaking internals
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // eslint-disable-next-line no-console
  console.error('Unhandled error', { requestId: req.id, error: err });
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'internal_error',
    message: err.message || 'Unexpected error',
    requestId: req.id,
  });
}

module.exports = errorHandler;
