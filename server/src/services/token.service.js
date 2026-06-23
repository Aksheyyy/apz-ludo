import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const BCRYPT_COST = 10;
const TOKEN_TTL = '7d';

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** Sign a JWT for a user. Payload kept tiny: id + username. */
export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

/** Verify a JWT, returning { id, username }. Throws if invalid/expired. */
export function verifyToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  return { id: Number(payload.sub), username: payload.username };
}
