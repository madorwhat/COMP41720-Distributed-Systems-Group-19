const AppError = require('../utils/AppError');

// Checks the request against a zod schema (see src/validators) and returns 400 if it doesn't match.
// The checked data replaces the original, so any extra fields a client sneaks in
// (e.g. "role": "system_admin" on signup) are removed before the controller sees them.
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      const first = details[0];
      return next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          `${first.field || source}: ${first.message}`,
          details,
        ),
      );
    }
    // In Express 5 `req.query = ...` isn't allowed, so we redefine the property instead.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };

module.exports = validate;
