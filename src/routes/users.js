import { createUser, requireRole } from "../services/authService.js";
import { json } from "../utils/response.js";

export function registerUserRoutes(router) {
  router.get("/api/users", async (request, env) => {
    await requireRole(request, env, ["admin"]);

    const result = await env.DB.prepare(
      `SELECT id, username, role, created_at
       FROM users
       ORDER BY username COLLATE NOCASE`
    ).all();

    return json({ users: result.results || [] });
  });

  router.post("/api/users", async (request, env) => {
    await requireRole(request, env, ["admin"]);
    const body = await request.json();

    if (!body.username || !body.password || body.password.length < 8) {
      return json(
        { error: "Username and a password of at least 8 characters are required" },
        400
      );
    }

    try {
      const user = await createUser({
        username: body.username.trim(),
        password: body.password,
        role: body.role || "uploader"
      }, env);

      return json({ user }, 201);
    } catch (error) {
      if (String(error.message).toLowerCase().includes("unique")) {
        return json({ error: "That username already exists" }, 409);
      }
      throw error;
    }
  });
}
