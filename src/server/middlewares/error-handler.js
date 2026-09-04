export function errorHandler(err, req, res, next) {
  console.error('[Error Pipeline]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'خطای داخلی سرور رخ داده است.';
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  res.status(statusCode).json({
    success: false,
    error: code,
    message: message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
}
