export class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cette route n’existe pas.' } });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Le corps JSON est invalide.' } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La requête est trop volumineuse.' } });
  }
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
  }
  console.error('Request failed', { code: error.code || 'INTERNAL_ERROR' });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' } });
}
