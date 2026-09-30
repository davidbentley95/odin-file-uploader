const DEFAULT_MESSAGES = {
  400: 'Bad request',
  401: 'You need to log in',
  403: 'Forbidden',
  404: 'Not found',
  500: 'Internal server error',
};

// Small stand-in for `http-errors`: attaches a status the error handler reads.
export function createError(status, message) {
  const err = new Error(message ?? DEFAULT_MESSAGES[status] ?? 'Error');
  err.status = status;
  return err;
}

export default createError;
