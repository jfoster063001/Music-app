import {
  validateAudioFile,
  getAudioExtension
} from "../utils/audio.js";


export async function listSongsPublic(env) {

  const result =
    await env.DB.prepare(
      `
        SELECT
          id,
          title

        FROM songs

        ORDER BY
          title COLLATE NOCASE
      `
    ).all();


  return result.results || [];
}


export async function listSongsAdmin(env) {

  const result =
    await env.DB.prepare(
      `
        SELECT
          id,
          title,
          artist,
          filename,
          uploaded_by,
          uploaded_at

        FROM songs

        ORDER BY
          artist COLLATE NOCASE,
          title COLLATE NOCASE
      `
    ).all();


  return result.results || [];
}


export async function uploadSong(
  {
    title,
    artist,
    file,
    userId = null
  },
  env
) {

  validateAudioFile(file);


  const songId =
    crypto.randomUUID();


  const extension =
    getAudioExtension(file);


  const r2Key =
    `songs/${songId}.${extension}`;


  try {

    /*
     * Upload audio to R2.
     */

    await env.MUSIC_BUCKET.put(
      r2Key,

      file.stream(),

      {
        httpMetadata: {
          contentType:
            file.type ||
            "application/octet-stream"
        }
      }
    );


    /*
     * Save metadata to D1.
     */

    await env.DB.prepare(
      `
        INSERT INTO songs (
          id,
          title,
          artist,
          filename,
          r2_key,
          uploaded_by
        )

        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        songId,

        title ||
          file.name,

        artist ||
          "Unknown Artist",

        file.name,

        r2Key,

        userId
      )
      .run();


  } catch (error) {

    /*
     * If the database operation fails
     * after R2 upload, remove the R2
     * object to prevent orphan files.
     */

    try {

      await env.MUSIC_BUCKET.delete(
        r2Key
      );

    } catch (cleanupError) {

      console.error(
        "Failed to clean up R2 object:",
        cleanupError
      );
    }


    throw error;
  }


  return {

    id:
      songId,

    title:
      title ||
      file.name,

    artist:
      artist ||
      "Unknown Artist"
  };
}


export async function getSong(
  id,
  env
) {

  return env.DB.prepare(
    `
      SELECT
        id,
        title,
        artist,
        filename,
        r2_key,
        uploaded_at

      FROM songs

      WHERE id = ?

      LIMIT 1
    `
  )
    .bind(id)
    .first();
}


export async function deleteSong(
  id,
  env
) {

  const song =
    await getSong(
      id,
      env
    );


  if (!song) {
    return false;
  }


  /*
   * Prevent deletion when a song is
   * part of an active or setup tournament.
   */

  const inActiveTournament =
    await env.DB.prepare(
      `
        SELECT
          t.id

        FROM tournament_songs ts

        JOIN tournaments t
          ON t.id =
             ts.tournament_id

        WHERE
          ts.song_id = ?

          AND t.status IN (
            'setup',
            'active'
          )

        LIMIT 1
      `
    )
      .bind(id)
      .first();


  if (inActiveTournament) {

    const error =
      new Error(
        "Cannot delete a song used in an active or setup tournament"
      );

    error.status = 409;

    throw error;
  }


  /*
   * Delete R2 object first.
   */

  await env.MUSIC_BUCKET.delete(
    song.r2_key
  );


  /*
   * Delete D1 metadata.
   */

  await env.DB.prepare(
    `
      DELETE FROM songs
      WHERE id = ?
    `
  )
    .bind(id)
    .run();


  return true;
}