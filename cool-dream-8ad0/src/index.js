import { Router } from "itty-router";

const router = Router();

/* =========================================================
   Utilities
========================================================= */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

function forbidden() {
  return json({ error: "Forbidden" }, 403);
}

/* =========================================================
   Password Hashing
========================================================= */

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/* =========================================================
   Authentication
========================================================= */

async function createSession(user, env) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  };

  const data = JSON.stringify(payload);
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  const signatureBase64 = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return (
    btoa(data) +
    "." +
    signatureBase64
  );
}


async function getUserFromRequest(request, env) {
  const cookie = request.headers.get("Cookie");

  if (!cookie) {
    return null;
  }

  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);

  if (!match) {
    return null;
  }

  const token = match[1];

  const [payloadBase64, signatureBase64] =
    token.split(".");

  if (!payloadBase64 || !signatureBase64) {
    return null;
  }

  try {
    const payload = JSON.parse(
      atob(payloadBase64)
    );

    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SESSION_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(
      atob(signatureBase64),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(JSON.stringify(payload))
    );

    if (!valid) {
      return null;
    }

    return payload;

  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

router.get("/api/songs", async (request, env) => {
  const results = await env.DB.prepare(`
    SELECT
      id,
      title,
      artist,
      filename,
      uploaded_at
    FROM songs
    ORDER BY uploaded_at DESC
  `).all();

  return json(results.results);
});


router.get(
  "/api/songs/:id/stream",
  async (request, env) => {
    const song = await env.DB.prepare(`
      SELECT *
      FROM songs
      WHERE id = ?
    `)
      .bind(request.params.id)
      .first();

    if (!song) {
      return json(
        { error: "Song not found" },
        404
      );
    }

    const object = await env.MUSIC_BUCKET.get(
      song.r2_key
    );

    if (!object) {
      return json(
        { error: "Music file missing" },
        404
      );
    }

    const headers = new Headers();

    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType ||
        "audio/mpeg"
    );

    headers.set(
      "Content-Length",
      object.size.toString()
    );

    headers.set(
      "Accept-Ranges",
      "bytes"
    );

    return new Response(
      object.body,
      {
        status: 200,
        headers
      }
    );
  }
);

/* =========================================================
   AUTH
========================================================= */

router.post(
  "/api/auth/login",
  async (request, env) => {
    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        { error: "Invalid JSON" },
        400
      );
    }

    const {
      username,
      password
    } = body;

    if (!username || !password) {
      return json(
        {
          error:
            "Username and password required"
        },
        400
      );
    }

    const user = await env.DB.prepare(`
      SELECT *
      FROM users
      WHERE username = ?
    `)
      .bind(username)
      .first();

    if (!user) {
      return unauthorized();
    }

    const passwordHash =
      await hashPassword(password);

    if (
      passwordHash !==
      user.password_hash
    ) {
      return unauthorized();
    }

    const session =
      await createSession(
        user,
        env
      );

    return json(
      {
        success: true,
        user: {
          username: user.username,
          role: user.role
        }
      },
      200,
      {
        "Set-Cookie":
          `session=${session}; ` +
          `HttpOnly; ` +
          `Secure; ` +
          `SameSite=Lax; ` +
          `Path=/; ` +
          `Max-Age=604800`
      }
    );
  }
);


router.get(
  "/api/auth/me",
  async (request, env) => {
    const user =
      await getUserFromRequest(
        request,
        env
      );

    if (!user) {
      return unauthorized();
    }

    return json({
      user
    });
  }
);


router.post(
  "/api/auth/logout",
  async () => {
    return json(
      {
        success: true
      },
      200,
      {
        "Set-Cookie":
          "session=; " +
          "HttpOnly; " +
          "Secure; " +
          "SameSite=Lax; " +
          "Path=/; " +
          "Max-Age=0"
      }
    );
  }
);

/* =========================================================
   UPLOAD
========================================================= */

router.post(
  "/api/songs/upload",
  async (request, env) => {
    const user =
      await getUserFromRequest(
        request,
        env
      );

    if (!user) {
      return unauthorized();
    }

    if (
      user.role !== "admin" &&
      user.role !== "uploader"
    ) {
      return forbidden();
    }

    const formData =
      await request.formData();

    const file =
      formData.get("file");

    const title =
      formData.get("title");

    const artist =
      formData.get("artist");

    if (
      !file ||
      typeof file.stream !== "function"
    ) {
      return json(
        {
          error:
            "Music file required"
        },
        400
      );
    }

    if (
      !file.type.startsWith("audio/")
    ) {
      return json(
        {
          error:
            "Only audio files are allowed"
        },
        400
      );
    }

    const songId =
      crypto.randomUUID();

    const extension =
      file.name.includes(".")
        ? file.name.split(".").pop()
        : "audio";

    const r2Key =
      `${songId}.${extension}`;

    await env.MUSIC_BUCKET.put(
      r2Key,
      file.stream(),
      {
        httpMetadata: {
          contentType: file.type
        }
      }
    );

    try {
      await env.DB.prepare(`
        INSERT INTO songs (
          id,
          title,
          artist,
          filename,
          r2_key,
          uploaded_by
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .bind(
          songId,
          title || file.name,
          artist || "Unknown Artist",
          file.name,
          r2Key,
          user.id
        )
        .run();

    } catch (error) {

      // If D1 fails, clean up the R2 object.
      await env.MUSIC_BUCKET.delete(
        r2Key
      );

      throw error;
    }

    return json({
      success: true,
      song: {
        id: songId,
        title: title || file.name,
        artist: artist || "Unknown Artist"
      }
    });
  }
);

/* =========================================================
   DELETE SONG
========================================================= */

router.delete(
  "/api/songs/:id",
  async (request, env) => {
    const user =
      await getUserFromRequest(
        request,
        env
      );

    if (!user) {
      return unauthorized();
    }

    if (user.role !== "admin") {
      return forbidden();
    }

    const song =
      await env.DB.prepare(`
        SELECT *
        FROM songs
        WHERE id = ?
      `)
        .bind(request.params.id)
        .first();

    if (!song) {
      return json(
        {
          error:
            "Song not found"
        },
        404
      );
    }

    await env.MUSIC_BUCKET.delete(
      song.r2_key
    );

    await env.DB.prepare(`
      DELETE FROM songs
      WHERE id = ?
    `)
      .bind(request.params.id)
      .run();

    return json({
      success: true
    });
  }
);

/* =========================================================
   CREATE USER
========================================================= */

router.post(
  "/api/users",
  async (request, env) => {
    const currentUser =
      await getUserFromRequest(
        request,
        env
      );

    if (
      !currentUser ||
      currentUser.role !== "admin"
    ) {
      return forbidden();
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        { error: "Invalid JSON" },
        400
      );
    }

    const {
      username,
      password,
      role
    } = body;

    if (!username || !password) {
      return json(
        {
          error:
            "Username and password required"
        },
        400
      );
    }

    const userRole =
      role === "admin"
        ? "admin"
        : "uploader";

    const passwordHash =
      await hashPassword(
        password
      );

    const userId =
      crypto.randomUUID();

    try {

      await env.DB.prepare(`
        INSERT INTO users (
          id,
          username,
          password_hash,
          role
        )
        VALUES (?, ?, ?, ?)
      `)
        .bind(
          userId,
          username,
          passwordHash,
          userRole
        )
        .run();

    } catch (error) {

      return json(
        {
          error:
            "Username already exists or database error"
        },
        409
      );
    }

    return json({
      success: true,
      user: {
        id: userId,
        username,
        role: userRole
      }
    });
  }
);

/* =========================================================
   API 404
========================================================= */

router.all(
  "/api/*",
  () => {
    return json(
      {
        error:
          "API route not found"
      },
      404
    );
  }
);

/* =========================================================
   WORKER
========================================================= */

export default {
  async fetch(request, env, ctx) {

    try {

      /*
       * API requests go through itty-router.
       */
      if (
        new URL(request.url)
          .pathname
          .startsWith("/api/")
      ) {
        return await router.handle(
          request,
          env,
          ctx
        );
      }

      /*
       * Everything else is served
       * from ./public using the
       * Cloudflare Assets binding.
       */
      return env.ASSETS.fetch(request);

    } catch (error) {

      console.error(
        "Worker error:",
        error
      );

      return json(
        {
          error:
            "Internal server error",
          message:
            error.message
        },
        500
      );
    }
  }
};