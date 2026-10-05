const { ValidationError, UniqueConstraintError } = require('sequelize');
const AppError = require('../utils/AppError');
const config = require('../config');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// Last stop for every error. Whatever was thrown, the client always gets the same shape:
// { error: { code, message } }. Unexpected errors become a generic 500 and are logged.
function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof UniqueConstraintError) {
    error = new AppError(409, 'CONFLICT', 'Resource already exists');
  } else if (err instanceof ValidationError) {
    // Normally zod rejects bad input first; this catches anything the model's own checks find.
    error = new AppError(
      400,
      'VALIDATION_ERROR',
      'Invalid data',
      err.errors.map((e) => e.message),
    );
  } else if (err.type === 'entity.parse.failed') {
    error = new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON body');
  } else if (err.type === 'entity.too.large') {
    error = new AppError(413, 'VALIDATION_ERROR', 'Request body too large');
  }

  if (!(error instanceof AppError)) {
    req.log.error({ err }, 'Unhandled error');
    const message = config.isProduction ? 'Something went wrong' : err.message;
    return res.status(500).json({ error: { code: 'INTERNAL', message, requestId: req.id } });
  }

  const body = { code: error.code, message: error.message };
  if (error.details) body.details = error.details;
  res.status(error.status).json({ error: body });
}

module.exports = { notFound, errorHandler };
