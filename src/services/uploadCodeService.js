const CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CODE_LENGTH = 10;


/**
 * Normalize upload codes.
 *
 * Allows users to enter:
 *
 * ABC12DEF34
 *
 * or:
 *
 * ABC12-DEF34
 */

export function normalizeCode(code) {
  return String(code || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}


/**
 * Generate a random upload code.
 */

export function generateUploadCode() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(CODE_LENGTH)
    );

  let code = "";

  for (
    let i = 0;
    i < CODE_LENGTH;
    i++
  ) {
    code +=
      CODE_ALPHABET[
        bytes[i] %
        CODE_ALPHABET.length
      ];
  }

  return code;
}


/**
 * Format code for display.
 *
 * ABC12DEF34
 *
 * becomes:
 *
 * ABC12-DEF34
 */

export function formatUploadCode(code) {
  const normalized =
    normalizeCode(code);

  return normalized.match(/.{1,5}/g)
    ?.join("-") ||
    normalized;
}


/**
 * Create a new upload code.
 */

export async function createUploadCode(env) {
  let attempts = 0;

  while (attempts < 10) {
    const code =
      generateUploadCode();

    try {
      await env.DB.prepare(`
        INSERT INTO upload_codes (
          code
        )

        VALUES (?)
      `)
        .bind(code)
        .run();

      return {
        code
      };

    } catch (error) {

      attempts++;

      /*
       * Retry if we somehow generated
       * an existing code.
       */

      if (attempts >= 10) {
        throw error;
      }
    }
  }
}


/**
 * Get upload code information.
 */

export async function getUploadCode(
  code,
  env
) {
  const normalized =
    normalizeCode(code);

  if (!normalized) {
    return null;
  }

  return env.DB.prepare(`
    SELECT
      code,
      created_at,
      reserved_at,
      used_at,
      used_song_id
    FROM upload_codes
    WHERE code = ?
  `)
    .bind(normalized)
    .first();
}


/**
 * Check that an upload code exists
 * and has not been permanently used.
 */

export async function requireUnusedUploadCode(
  code,
  env
) {
  const uploadCode =
    await getUploadCode(
      code,
      env
    );

  if (!uploadCode) {
    const error = new Error(
      "Invalid upload code"
    );

    error.status = 403;

    throw error;
  }

  if (uploadCode.used_at) {
    const error = new Error(
      "This upload code has already been used"
    );

    error.status = 409;

    throw error;
  }

  return uploadCode;
}


/**
 * Reserve an upload code.
 *
 * A reservation automatically expires
 * after 15 minutes.
 */

export async function reserveUploadCode(
  code,
  env
) {
  const normalized =
    normalizeCode(code);

  const result =
    await env.DB.prepare(`
      UPDATE upload_codes

      SET reserved_at =
        CURRENT_TIMESTAMP

      WHERE code = ?

        AND used_at IS NULL

        AND (
          reserved_at IS NULL

          OR reserved_at <
            datetime(
              'now',
              '-15 minutes'
            )
        )
    `)
      .bind(normalized)
      .run();

  const changes =
    Number(
      result.meta?.changes || 0
    );

  if (changes === 0) {
    const error = new Error(
      "This upload code is currently unavailable"
    );

    error.status = 409;

    throw error;
  }

  return true;
}


/**
 * Release a reserved code.
 *
 * Used if an upload fails.
 */

export async function releaseReservedUploadCode(
  code,
  env
) {
  const normalized =
    normalizeCode(code);

  await env.DB.prepare(`
    UPDATE upload_codes

    SET reserved_at = NULL

    WHERE code = ?

      AND used_at IS NULL
  `)
    .bind(normalized)
    .run();
}


/**
 * Permanently consume the code.
 */

export async function finalizeReservedUploadCode(
  code,
  songId,
  env
) {
  const normalized =
    normalizeCode(code);

  const result =
    await env.DB.prepare(`
      UPDATE upload_codes

      SET
        used_at =
          CURRENT_TIMESTAMP,

        used_song_id = ?,

        reserved_at = NULL

      WHERE code = ?

        AND used_at IS NULL
    `)
      .bind(
        songId,
        normalized
      )
      .run();

  const changes =
    Number(
      result.meta?.changes || 0
    );

  if (changes === 0) {
    const error = new Error(
      "Unable to finalize upload code"
    );

    error.status = 409;

    throw error;
  }

  return true;
}


/**
 * Get all upload codes.
 *
 * Host use only.
 */

export async function getAllUploadCodes(env) {
  const result =
    await env.DB.prepare(`
      SELECT
        code,
        created_at,
        reserved_at,
        used_at,
        used_song_id

      FROM upload_codes

      ORDER BY
        created_at DESC
    `)
      .all();

  return result.results || [];
}


/**
 * Delete an upload code.
 *
 * Used codes cannot be deleted.
 */

export async function deleteUploadCode(
  code,
  env
) {
  const normalized =
    normalizeCode(code);

  const existing =
    await getUploadCode(
      normalized,
      env
    );

  if (!existing) {
    const error = new Error(
      "Upload code not found"
    );

    error.status = 404;

    throw error;
  }

  if (existing.used_at) {
    const error = new Error(
      "Used upload codes cannot be deleted"
    );

    error.status = 409;

    throw error;
  }

  await env.DB.prepare(`
    DELETE FROM upload_codes

    WHERE code = ?
  `)
    .bind(normalized)
    .run();

  return true;
}