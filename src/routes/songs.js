import {
  deleteSong,
  getSong,
  listSongsAdmin,
  listSongsPublic
} from "../services/songService.js";


import {
  requireSecret
} from "../utils/secrets.js";


import {
  json,
  notFound
} from "../utils/response.js";


export function registerSongRoutes(
  router
) {

  /**
   * Public song list.
   *
   * Artist information is intentionally
   * hidden from the public.
   */

  router.get(
    "/api/songs",

    async (_request, env) => {

      const songs =
        await listSongsPublic(env);

      return json({
        songs
      });
    }
  );


  /**
   * Host/admin song list.
   */

  router.get(
    "/api/songs/admin",

    async (request, env) => {

      requireSecret(
        request,
        env,
        {
          envKey:
            "HOST_SECRET",

          headerName:
            "x-host-secret",

          label:
            "host secret"
        }
      );


      const songs =
        await listSongsAdmin(env);


      return json({
        songs
      });
    }
  );


  /**
   * Stream a song.
   */

  router.get(
    "/api/songs/:id/stream",

    async (request, env) => {

      const song =
        await getSong(
          request.params.id,
          env
        );


      if (!song) {
        return notFound(
          "Song not found"
        );
      }


      const object =
        await env.MUSIC_BUCKET.get(
          song.r2_key
        );


      if (!object) {
        return notFound(
          "Audio object not found"
        );
      }


      const headers =
        new Headers();


      object.writeHttpMetadata(
        headers
      );


      headers.set(
        "Cache-Control",
        "private, max-age=3600"
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
    }
  );


  /**
   * Delete a song.
   *
   * Host only.
   */

  router.delete(
    "/api/songs/:id",

    async (request, env) => {

      requireSecret(
        request,
        env,
        {
          envKey:
            "HOST_SECRET",

          headerName:
            "x-host-secret",

          label:
            "host secret"
        }
      );


      const deleted =
        await deleteSong(
          request.params.id,
          env
        );


      return deleted
        ? json({
            ok: true
          })
        : notFound(
            "Song not found"
          );
    }
  );
}