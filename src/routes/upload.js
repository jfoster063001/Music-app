import { json } from "../utils/response.js";
import { uploadSong } from "../services/songService.js";
import {
  normalizeCode,
  requireUnusedUploadCode,
  reserveUploadCode,
  releaseReservedUploadCode,
  finalizeReservedUploadCode
} from "../services/uploadCodeService.js";

const UPLOAD_COOKIE = "song_clash_upload_code";

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;

  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );

  return match ? decodeURIComponent(match[1]) : null;
}

function createUploadCookie(request, code) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${UPLOAD_COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=21600${secure}`;
}

function clearUploadCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return `${UPLOAD_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function readUploadCode(request) {
  return normalizeCode(getCookie(request, UPLOAD_COOKIE));
}

export function registerUploadRoutes(router) {
  router.get("/api/upload/session", async (request, env) => {
    const code = readUploadCode(request);

    if (!code) {
      return json({ active: false, used: false });
    }

    try {
      await requireUnusedUploadCode(code, env);
      return json({ active: true, used: false });
    } catch (error) {
      if (error.status === 409) {
        return json(
          { active: false, used: true },
          200,
          { "Set-Cookie": clearUploadCookie(request) }
        );
      }

      if (error.status === 403) {
        return json(
          { active: false, used: false },
          200,
          { "Set-Cookie": clearUploadCookie(request) }
        );
      }

      throw error;
    }
  });

  router.post("/api/upload/access", async (request, env) => {
    const body = await request.json();
    const code = normalizeCode(body.code);

    if (!code) {
      return json({ error: "Upload code is required" }, 400);
    }

    await requireUnusedUploadCode(code, env);

    return json(
      { ok: true },
      200,
      { "Set-Cookie": createUploadCookie(request, code) }
    );
  });

  router.post("/api/upload/submit", async (request, env) => {
    const uploadCode = readUploadCode(request);

    if (!uploadCode) {
      return json(
        { error: "Upload access expired. Enter your upload code again." },
        401
      );
    }

    await requireUnusedUploadCode(uploadCode, env);

    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const artist = String(formData.get("artist") || "").trim();
    const file = formData.get("file");

    if (!title || !artist || !file) {
      return json(
        { error: "Song title, artist name, and audio file are required" },
        400
      );
    }

    await reserveUploadCode(uploadCode, env);

    let song;

    try {
      song = await uploadSong(
        {
          title,
          artist,
          file
        },
        env
      );

      await finalizeReservedUploadCode(uploadCode, song.id, env);
    } catch (error) {
      await releaseReservedUploadCode(uploadCode, env);
      throw error;
    }

    return json(
      {
        ok: true,
        song: {
          id: song.id,
          title: song.title
        }
      },
      201,
      { "Set-Cookie": clearUploadCookie(request) }
    );
  });
}
