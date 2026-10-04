// Express 4 n'attrape pas les erreurs des handlers async : on les transmet à errorHandler.
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
