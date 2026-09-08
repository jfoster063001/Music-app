import { Router } from "itty-router";

const router = Router();

/**
 * ============================
 * Utility Functions
 * ============================
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

function forbidden() {
  return json({ error: "Forbidden" }, 403);
}


/**
 * ============================
 * Password Hashing
 * ============================
 *
 * Uses SHA-256 as a basic example.
 *
 * For production, consider using
 * PBKDF2 or another password hashing
 * strategy.
 */

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


/**
 * ============================
 * Authentication
 * ============================
 */

async function createSession(user, env) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + (1000 * 60 * 60 * 24 * 7)
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

  return btoa(data) + "." + signatureBase64;
}


async function getUserFromRequest(request, env) {

  const cookie = request.headers.get("Cookie");

  if (!cookie) {
    return null;
  }

  const match = cookie.match(/session=([^;]+)/);

  if (!match) {
    return null;
  }

  const token = match[1];

  const [payloadBase64, signature] = token.split(".");

  if (!payloadBase64 || !signature) {
    return null;
  }

  try {

    const payload = JSON.parse(
      atob(payloadBase64)
    );

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;

  } catch {
    return null;
  }
}


/**
 * ============================
 * PUBLIC ROUTES
 * ============================
 */


/**
 * Get all songs
 *
 * GET /api/songs
 */

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


/**
 * Stream a song
 *
 * GET /api/songs/:id/stream
 */

router.get("/api/songs/:id/stream", async (request, env) => {

  const song = await env.DB.prepare(`
    SELECT *
    FROM songs
    WHERE id = ?
  `)
    .bind(request.params.id)
    .first();

  if (!song) {
    return json({
      error: "Song not found"
    }, 404);
  }

  const object = await env.MUSIC_BUCKET.get(
    song.r2_key
  );

  if (!object) {
    return json({
      error: "Music file missing"
    }, 404);
  }

  const headers = new Headers();

  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ||
      "audio/mpeg"
  );

  headers.set(
    "Accept-Ranges",
    "bytes"
  );

  return new Response(
    object.body,
    {
      headers
    }
  );
});


/**
 * ============================
 * AUTH ROUTES
 * ============================
 */


/**
 * Login
 *
 * POST /api/auth/login
 *
 * {
 *   "username": "jackson",
 *   "password": "password"
 * }
 */

router.post(
  "/api/auth/login",
  async (request, env) => {

    const body = await request.json();

    const {
      username,
      password
    } = body;

    if (!username || !password) {
      return json({
        error: "Username and password required"
      }, 400);
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

    const passwordHash = await hashPassword(
      password
    );

    if (
      passwordHash !==
      user.password_hash
    ) {
      return unauthorized();
    }

    const session = await createSession(
      user,
      env
    );

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          username: user.username,
          role: user.role
        }
      }),
      {
        headers: {
          "Content-Type":
            "application/json",

          "Set-Cookie":
            `session=${session}; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Path=/; ` +
            `Max-Age=604800`
        }
      }
    );
  }
);


/**
 * Get current user
 *
 * GET /api/auth/me
 */

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


/**
 * Logout
 *
 * POST /api/auth/logout
 */

router.post(
  "/api/auth/logout",
  async () => {

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        headers: {
          "Content-Type":
            "application/json",

          "Set-Cookie":
            "session=; " +
            "HttpOnly; " +
            "Secure; " +
            "Path=/; " +
            "Max-Age=0"
        }
      }
    );
  }
);


/**
 * ============================
 * UPLOAD MUSIC
 * ============================
 *
 * POST /api/songs/upload
 *
 * Only:
 * admin
 * uploader
 */

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

    if (!file) {
      return json({
        error: "Music file required"
      }, 400);
    }

    /*
     * Only allow audio files
     */

    if (
      !file.type.startsWith(
        "audio/"
      )
    ) {
      return json({
        error:
          "Only audio files are allowed"
      }, 400);
    }


    /*
     * Generate unique ID
     */

    const songId =
      crypto.randomUUID();


    /*
     * Generate R2 filename
     */

    const extension =
      file.name.split(".").pop();

    const r2Key =
      `${songId}.${extension}`;


    /*
     * Upload file to R2
     */

    await env.MUSIC_BUCKET.put(
      r2Key,
      file.stream(),
      {
        httpMetadata: {
          contentType:
            file.type
        }
      }
    );


    /*
     * Save metadata in D1
     */

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
        title ||
          file.name,

        artist ||
          "Unknown Artist",

        file.name,

        r2Key,

        user.id
      )
      .run();


    return json({
      success: true,

      song: {
        id: songId,
        title,
        artist
      }
    });
  }
);


/**
 * ============================
 * DELETE SONG
 * ============================
 *
 * Admin only
 */

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

    if (
      user.role !== "admin"
    ) {
      return forbidden();
    }

    const song =
      await env.DB.prepare(`
        SELECT *
        FROM songs
        WHERE id = ?
      `)
        .bind(
          request.params.id
        )
        .first();

    if (!song) {
      return json({
        error:
          "Song not found"
      }, 404);
    }


    /*
     * Delete from R2
     */

    await env.MUSIC_BUCKET.delete(
      song.r2_key
    );


    /*
     * Delete metadata
     */

    await env.DB.prepare(`
      DELETE FROM songs
      WHERE id = ?
    `)
      .bind(
        request.params.id
      )
      .run();


    return json({
      success: true
    });
  }
);


/**
 * ============================
 * CREATE USER
 * ============================
 *
 * Admin only
 */

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

    const {
      username,
      password,
      role
    } = await request.json();


    if (
      !username ||
      !password
    ) {
      return json({
        error:
          "Username and password required"
      }, 400);
    }


    const passwordHash =
      await hashPassword(
        password
      );


    const userId =
      crypto.randomUUID();


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
        role || "uploader"
      )
      .run();


    return json({
      success: true,

      user: {
        id: userId,
        username,
        role:
          role || "uploader"
      }
    });
  }
);


/**
 * ============================
 * FALLBACK
 * ============================
 */

router.all("*", () => {

  return json({
    error:
      "Route not found"
  }, 404);

});


export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    return router.handle(
      request,
      env,
      ctx
    );
  }

};