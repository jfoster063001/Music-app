import { json } from "../utils/response.js";

import {
  uploadSong
} from "../services/songService.js";

import {
  normalizeCode,
  requireUnusedUploadCode,
  reserveUploadCode,
  releaseReservedUploadCode,
  finalizeReservedUploadCode
} from "../services/uploadCodeService.js";


const UPLOAD_COOKIE =
  "song_clash_upload_code";


function getCookie(request, name) {
  const cookie =
    request.headers.get("Cookie");

  if (!cookie) {
    return null;
  }

  const match = cookie.match(
    new RegExp(
      `(?:^|;\\s*)${name}=([^;]*)`
    )
  );

  return match
    ? decodeURIComponent(match[1])
    : null;
}


function createUploadCookie(
  request,
  code
) {
  const isHttps =
    new URL(request.url)
      .protocol === "https:";

  return [
    `${UPLOAD_COOKIE}=${encodeURIComponent(code)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=21600",

    ...(isHttps
      ? ["Secure"]
      : [])
  ].join("; ");
}


function clearUploadCookie(request) {
  const isHttps =
    new URL(request.url)
      .protocol === "https:";

  return [
    `${UPLOAD_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",

    ...(isHttps
      ? ["Secure"]
      : [])
  ].join("; ");
}


export function registerUploadRoutes(router) {

  /**
   * Validate an upload code.
   *
   * POST /api/upload/access
   */

  router.post(
    "/api/upload/access",

    async (request, env) => {

      const body =
        await request.json();

      const code =
        normalizeCode(body.code);


      if (!code) {
        return json(
          {
            error:
              "Upload code is required"
          },
          400
        );
      }


      await requireUnusedUploadCode(
        code,
        env
      );


      return new Response(
        JSON.stringify({
          success: true
        }),

        {
          headers: {
            "Content-Type":
              "application/json",

            "Set-Cookie":
              createUploadCookie(
                request,
                code
              )
          }
        }
      );
    }
  );


  /**
   * Upload a song.
   *
   * POST /api/upload/submit
   */

  router.post(
    "/api/upload/submit",

    async (request, env) => {

      const uploadCode =
        getCookie(
          request,
          UPLOAD_COOKIE
        );


      if (!uploadCode) {
        return json(
          {
            error:
              "Upload authorization expired"
          },
          403
        );
      }


      await requireUnusedUploadCode(
        uploadCode,
        env
      );


      /*
       * Reserve the upload code before
       * processing the upload.
       *
       * This prevents two simultaneous
       * uploads from using the same code.
       */

      await reserveUploadCode(
        uploadCode,
        env
      );


      try {

        const formData =
          await request.formData();


        const file =
          formData.get("file");


        const title =
          String(
            formData.get("title") || ""
          ).trim();


        const artist =
          String(
            formData.get("artist") || ""
          ).trim();


        const song =
          await uploadSong(
            {
              title,
              artist,
              file
            },
            env
          );


        /*
         * Permanently consume
         * the upload code.
         */

        await finalizeReservedUploadCode(
          uploadCode,
          song.id,
          env
        );


        return new Response(
          JSON.stringify({
            success: true,

            song: {
              id: song.id,
              title: song.title
            }
          }),

          {
            headers: {
              "Content-Type":
                "application/json",

              "Set-Cookie":
                clearUploadCookie(
                  request
                )
            }
          }
        );

      } catch (error) {

        /*
         * Release the reservation so
         * the user can try again.
         */

        await releaseReservedUploadCode(
          uploadCode,
          env
        );

        throw error;
      }
    }
  );
}