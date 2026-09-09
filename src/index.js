import { Router } from "itty-router";

import { registerAuthRoutes } from "./routes/auth.js";
import { registerMatchupRoutes } from "./routes/matchups.js";
import { registerSongRoutes } from "./routes/songs.js";
import { registerTournamentRoutes } from "./routes/tournaments.js";
import { registerUploadRoutes } from "./routes/upload.js";
import { registerUploadCodeRoutes } from "./routes/uploadcodes.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerVotingRoutes } from "./routes/voting.js";

import { json } from "./utils/response.js";


const router = Router();


/*
 * Register API routes
 */

registerAuthRoutes(router);

registerSongRoutes(router);

registerUserRoutes(router);

registerTournamentRoutes(router);

registerMatchupRoutes(router);

registerVotingRoutes(router);

registerUploadRoutes(router);

registerUploadCodeRoutes(router);


/*
 * API fallback
 */

router.all(
  "/api/*",

  () =>
    json(
      {
        error: "API route not found"
      },
      404
    )
);


/*
 * Build a request for a static asset.
 *
 * This lets:
 *
 * /host
 *
 * serve:
 *
 * /views/host.html
 */

function assetRequest(
  request,
  pathname
) {
  const url =
    new URL(request.url);

  url.pathname =
    pathname;


  return new Request(
    url.toString(),
    {
      method: "GET",
      headers: request.headers
    }
  );
}


/*
 * Cloudflare Worker entry point
 */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    try {

      const url =
        new URL(request.url);


      /*
       * API requests go through
       * itty-router.
       */

      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {

        return await router.fetch(
          request,
          env,
          ctx
        );
      }


      /*
       * Clean page URLs.
       */

      const pageAliases = {

        "/":
          "/index.html",

        "/host":
          "/views/host.html",

        "/display":
          "/views/display.html",

        "/voting":
          "/views/voting.html",

        "/upload":
          "/views/upload.html"
      };


      const alias =
        pageAliases[
          url.pathname
        ];


      if (alias) {

        return env.ASSETS.fetch(
          assetRequest(
            request,
            alias
          )
        );
      }


      /*
       * Everything else is handled
       * normally by the static asset
       * binding.
       *
       * Examples:
       *
       * /styles/global.css
       * /js/host/host.js
       */

      return env.ASSETS.fetch(
        request
      );


    } catch (error) {

      console.error(error);


      const status =
        Number(
          error.status
        ) || 500;


      const payload = {

        error:
          status === 500
            ? "Internal server error"
            : error.message
      };


      if (error.details) {

        Object.assign(
          payload,
          error.details
        );
      }


      return json(
        payload,
        status
      );
    }
  }
};