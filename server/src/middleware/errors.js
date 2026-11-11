// Shared error type, async wrapper, and the Express error handler.
// Response shape (see docs/architecture.md):
//   { "error": { "code": "VALIDATION", "message": "...", "fields": {} } }
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Express 4 does not catch rejected promises, so wrap async handlers.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function zodFields(err) {
  const fields = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function notFoundApi(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let code = 'INTERNAL';
  let message = 'Something went wrong';
  let fields = {};

  if (err instanceof AppError) {
    ({ status, code, message, fields } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION';
    message = 'Invalid input';
    fields = zodFields(err);
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'VALIDATION';
    message = 'Request body is not valid JSON';
  } else {
    // Unknown error: log details server-side, never leak them to the client.
    console.error(err);
  }

  res.status(status).json({ error: { code, message, fields } });
}
