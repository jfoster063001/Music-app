import { json } from "../utils/response.js";

import {
  requireSecret
} from "../utils/secrets.js";

import {
  createUploadCode,
  listUploadCodes,
  deleteUploadCode
} from "../services/uploadCodeService.js";


export function registerUploadCodeRoutes(router) {

  /**
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
        await listUploadCodes(env);


      return json({
        codes
      });
    }
  );


  /**
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


      const code =
        await createUploadCode(env);


      return json(
        {
          success: true,
          code
        },
        201
      );
    }
  );


  /**
   * Delete an upload code.
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


      const deleted =
        await deleteUploadCode(
          request.params.code,
          env
        );


      if (!deleted) {

        return json(
          {
            error: "Upload code not found"
          },
          404
        );
      }


      return json({
        success: true
      });
    }
  );
}