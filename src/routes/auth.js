import { authenticate, createUser, login, requireRole } from "../services/authService.js";
import { clearSessionCookie, sessionCookie } from "../utils/auth.js";
import { json } from "../utils/response.js";

export function registerAuthRoutes(router) {
  router.post("/api/auth/login", async (request, env) => {
    const body = await request.json();
    const result = await login(body.username?.trim(), body.password, env);

    if (!result) {
      return json({ error: "Invalid username or password" }, 401);
    }

    return json(
      { user: result.user },
      200,
      { "Set-Cookie": sessionCookie(result.token, request) }
    );
  });

  router.post("/api/auth/logout", async (request) => {
    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearSessionCookie(request) }
    );
  });

  router.get("/api/auth/me", async (request, env) => {
    const user = await authenticate(request, env);
    return json({ user });
  });

  router.post("/api/auth/bootstrap", async (request, env) => {
    const count = Number(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first("count") || 0
    );

    if (count > 0) {
      return json({ error: "Bootstrap is disabled after the first user is created" }, 409);
    }

    const body = await request.json();

    if (!env.BOOTSTRAP_KEY || body.bootstrapKey !== env.BOOTSTRAP_KEY) {
      return json({ error: "Invalid bootstrap key" }, 403);
    }

    if (!body.username || !body.password || body.password.length < 8) {
      return json({ error: "Username and a password of at least 8 characters are required" }, 400);
    }

    const user = await createUser({
      username: body.username.trim(),
      password: body.password,
      role: "admin"
    }, env);

    return json({ user }, 201);
  });
}
