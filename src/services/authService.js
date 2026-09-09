import {
  createSessionToken,
  getCookie,
  hashPassword,
  verifyPassword,
  verifySessionToken
} from "../utils/auth.js";

export async function authenticate(request, env) {
  const token = getCookie(request, "session");
  const payload = await verifySessionToken(token, env.SESSION_SECRET);
  if (!payload) return null;

  return env.DB.prepare(
    "SELECT id, username, role, created_at FROM users WHERE id = ? LIMIT 1"
  ).bind(payload.sub).first();
}

export async function requireRole(request, env, roles) {
  const user = await authenticate(request, env);
  if (!user) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }

  if (!roles.includes(user.role)) {
    const error = new Error("Insufficient permissions");
    error.status = 403;
    throw error;
  }

  return user;
}

export async function login(username, password, env) {
  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, salt, role FROM users WHERE username = ? LIMIT 1"
  ).bind(username).first();

  if (!user) return null;

  const valid = await verifyPassword(password, user.salt, user.password_hash);
  if (!valid) return null;

  const token = await createSessionToken(user, env.SESSION_SECRET);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  };
}

export async function createUser({ username, password, role }, env) {
  if (!["admin", "uploader", "host"].includes(role)) {
    throw new Error("Invalid role");
  }

  const id = crypto.randomUUID();
  const { hash, salt } = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users (id, username, password_hash, salt, role)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, username, hash, salt, role).run();

  return { id, username, role };
}
