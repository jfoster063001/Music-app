import { json } from "../utils/response.js";

import {
  requireSecret
} from "../utils/secrets.js";

import {
  createUploadCode,
  getAllUploadCodes,
  deleteUploadCode
} from "../services/uploadCodeService.js";


export function registerUploadCodeRoutes(router) {

  /*
   * Get all upload codes.
   *
   * Host only.
   */

  router.get(
    "/api/upload-codes",

    async (request, env) => {

      requireSecret(
        request,
        env,
        {
          envKey: "HOST_SECRET",
          headerName: "x-host-secret",
          label: "host secret"
        }
      );


      const codes =
        await getAllUploadCodes(env);


      return json({
        codes
      });
    }
  );


  /*
   * Create a new upload code.
   *
   * Host only.
   */

  router.post(
    "/api/upload-codes",

    async (request, env) => {

      requireSecret(
        request,
        env,
        {
          envKey: "HOST_SECRET",
          headerName: "x-host-secret",
          label: "host secret"
        }
      );


      const created =
        await createUploadCode(env);


      return json(
        {
          code: created.code
        },
        201
      );
    }
  );


  /*
   * Delete an unused upload code.
   *
   * Host only.
   */

  router.delete(
    "/api/upload-codes/:code",

    async (request, env) => {

      requireSecret(
        request,
        env,
        {
          envKey: "HOST_SECRET",
          headerName: "x-host-secret",
          label: "host secret"
        }
      );


      await deleteUploadCode(
        request.params.code,
        env
      );


      return json({
        ok: true
      });
    }
  );
}