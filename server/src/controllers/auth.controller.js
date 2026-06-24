import { badRequest, conflict, unauthorized, notFound } from '../middleware/error.js';
import { signToken, verifyPassword } from '../services/token.service.js';
import * as users from '../services/user.service.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function validateCredentials(username, password) {
  if (!username || !USERNAME_RE.test(username)) {
    throw badRequest(
      'INVALID_USERNAME',
      'Username must be 3–20 chars: letters, numbers, or underscore.'
    );
  }
  if (!password || password.length < 6) {
    throw badRequest('INVALID_PASSWORD', 'Password must be at least 6 characters.');
  }
}

export async function register(req, res) {
  const { username, password } = req.body ?? {};
  validateCredentials(username, password);

  if (await users.findByUsername(username)) {
    throw conflict('USERNAME_TAKEN', 'That username is already taken.');
  }
  const user = await users.createUser(username, password);
  res.status(201).json({ token: signToken(user), user });
}

export async function login(req, res) {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    throw badRequest('MISSING_CREDENTIALS', 'Username and password are required.');
  }
  const row = await users.findByUsername(username);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw unauthorized('Invalid username or password.');
  }
  const user = { id: row.id, username: row.username };
  res.json({ token: signToken(user), user });
}

export async function me(req, res) {
  const user = await users.findById(req.user.id);
  if (!user) throw notFound('USER_NOT_FOUND', 'User no longer exists.');
  res.json({ user });
}
