import { verifyToken } from '../services/token.service.js';
import { unauthorized } from './error.js';

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * Sets req.user = { id, username }.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Missing or malformed Authorization header.'));
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(unauthorized('Invalid or expired token.'));
  }
}
