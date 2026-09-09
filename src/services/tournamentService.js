import {
  buildRoundRobinMatchups,
  createNextDoubleEliminationMatch
} from "./bracketService.js";

const RESULT_HOLD_SECONDS = 6;
const ACTIVE_AUDIENCE_SECONDS = 45;

function createError(message, status = 400, details = null) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function phaseTiming(durationSeconds = 0) {
  const startedAt = new Date();
  const duration = Math.max(0, Number(durationSeconds) || 0);

  return {
    startedAt: startedAt.toISOString(),
    endsAt: duration > 0
      ? new Date(startedAt.getTime() + duration * 1000).toISOString()
      : null
  };
}

async function insertMatchups(matchups, env) {
  if (!matchups.length) return;

  const statements = matchups.map(match =>
    env.DB.prepare(
      `INSERT INTO matchups
       (id, tournament_id, song_a_id, song_b_id, round_number, bracket, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      match.id,
      match.tournamentId,
      match.songAId,
      match.songBId,
      match.roundNumber,
      match.bracket,
      match.sequence
    )
  );

  await env.DB.batch(statements);
}

export async function createTournament(
  { name, tournamentType, songIds, userId },
  env
) {
  if (!["round_robin", "double_elimination"].includes(tournamentType)) {
    throw createError(
      "Tournament type must be round_robin or double_elimination",
      400
    );
  }

  const uniqueSongIds = [...new Set(songIds || [])];

  if (uniqueSongIds.length < 2) {
    throw createError("Select at least two songs", 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id
     FROM tournaments
     WHERE status IN ('setup', 'active')
     LIMIT 1`
  ).first();

  if (existing) {
    throw createError(
      "Finish or delete the current tournament before creating another",
      409
    );
  }

  const placeholders = uniqueSongIds.map(() => "?").join(", ");
  const songsFound = Number(
    await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM songs
       WHERE id IN (${placeholders})`
    ).bind(...uniqueSongIds).first("count") || 0
  );

  if (songsFound !== uniqueSongIds.length) {
    throw createError("One or more selected songs no longer exist", 400);
  }

  const tournamentId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO tournaments
     (id, name, tournament_type, status, state, created_by)
     VALUES (?, ?, ?, 'setup', 'setup', ?)`
  ).bind(
    tournamentId,
    (name || "Song Clash").trim(),
    tournamentType,
    userId
  ).run();

  const songStatements = uniqueSongIds.map((songId, index) =>
    env.DB.prepare(
      `INSERT INTO tournament_songs
       (tournament_id, song_id, seed)
       VALUES (?, ?, ?)`
    ).bind(tournamentId, songId, index + 1)
  );

  await env.DB.batch(songStatements);

  if (tournamentType === "round_robin") {
    await insertMatchups(
      buildRoundRobinMatchups(tournamentId, uniqueSongIds),
      env
    );
  }

  return getTournament(tournamentId, env);
}

export async function getTournament(id, env) {
  if (!id) return null;

  const tournament = await env.DB.prepare(
    "SELECT * FROM tournaments WHERE id = ? LIMIT 1"
  ).bind(id).first();

  if (!tournament) return null;

  const songs = await env.DB.prepare(
    `SELECT
       ts.song_id AS id,
       s.title,
       s.artist,
       ts.seed,
       ts.wins,
       ts.losses,
       ts.eliminated
     FROM tournament_songs ts
     JOIN songs s ON s.id = ts.song_id
     WHERE ts.tournament_id = ?
     ORDER BY ts.seed`
  ).bind(id).all();

  return {
    ...tournament,
    songs: songs.results || []
  };
}

export async function getCurrentTournament(env) {
  const tournament = await env.DB.prepare(
    `SELECT id
     FROM tournaments
     WHERE status IN ('setup', 'active')
     ORDER BY created_at DESC
     LIMIT 1`
  ).first();

  return tournament ? getTournament(tournament.id, env) : null;
}

export async function startTournament(id, env) {
  const tournament = await getTournament(id, env);

  if (!tournament) {
    throw createError("Tournament not found", 404);
  }

  if (tournament.status !== "setup") {
    throw createError("Tournament has already been started", 409);
  }

  let matchupId;

  if (tournament.tournament_type === "round_robin") {
    matchupId = await env.DB.prepare(
      `SELECT id
       FROM matchups
       WHERE tournament_id = ? AND status = 'pending'
       ORDER BY sequence
       LIMIT 1`
    ).bind(id).first("id");
  } else {
    const next = await createNextDoubleEliminationMatch(id, env);
    matchupId = next.matchupId;
  }

  if (!matchupId) {
    throw createError("No matchup is available", 409);
  }

  const timing = phaseTiming();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE tournaments
       SET status = 'active',
           state = 'waiting',
           current_matchup_id = ?,
           phase_detail = 'ready',
           phase_started_at = ?,
           phase_ends_at = NULL
       WHERE id = ?`
    ).bind(matchupId, timing.startedAt, id),

    env.DB.prepare(
      "UPDATE matchups SET status = 'active' WHERE id = ?"
    ).bind(matchupId)
  ]);

  return getPublicState(env);
}

export async function setTournamentState(
  tournamentId,
  matchupId,
  state,
  env,
  options = {}
) {
  const allowed = ["waiting", "song_a", "song_b", "voting", "results"];

  if (!allowed.includes(state)) {
    throw createError("Invalid tournament state", 400);
  }

  const tournament = await env.DB.prepare(
    `SELECT id, current_matchup_id, status
     FROM tournaments
     WHERE id = ?
     LIMIT 1`
  ).bind(tournamentId).first();

  if (!tournament || tournament.status !== "active") {
    throw createError("Tournament is not active", 409);
  }

  if (tournament.current_matchup_id !== matchupId) {
    throw createError("That is not the current matchup", 409);
  }

  const timing = phaseTiming(options.durationSeconds);
  const phaseDetail = String(options.phaseDetail || state).slice(0, 64);

  await env.DB.prepare(
    `UPDATE tournaments
     SET state = ?,
         phase_detail = ?,
         phase_started_at = ?,
         phase_ends_at = ?
     WHERE id = ?`
  ).bind(
    state,
    phaseDetail,
    timing.startedAt,
    timing.endsAt,
    tournamentId
  ).run();

  return getPublicState(env);
}

export async function getCurrentMatchup(tournamentId, matchupId, env) {
  if (!matchupId) return null;

  return env.DB.prepare(
    `SELECT
       m.*,
       a.title AS song_a_title,
       a.artist AS song_a_artist,
       b.title AS song_b_title,
       b.artist AS song_b_artist,
       w.title AS winner_title,
       w.artist AS winner_artist
     FROM matchups m
     JOIN songs a ON a.id = m.song_a_id
     JOIN songs b ON b.id = m.song_b_id
     LEFT JOIN songs w ON w.id = m.winner_song_id
     WHERE m.tournament_id = ? AND m.id = ?
     LIMIT 1`
  ).bind(tournamentId, matchupId).first();
}

export async function completeCurrentMatchup(
  tournamentId,
  matchupId,
  forcedWinnerId,
  env
) {
  const tournament = await env.DB.prepare(
    `SELECT id, tournament_type, current_matchup_id, state
     FROM tournaments
     WHERE id = ?
     LIMIT 1`
  ).bind(tournamentId).first();

  if (!tournament || tournament.current_matchup_id !== matchupId) {
    throw createError("That is not the current matchup", 409);
  }

  if (tournament.state !== "voting") {
    throw createError(
      "Voting is not currently open for this matchup",
      409
    );
  }

  const matchup = await env.DB.prepare(
    `SELECT *
     FROM matchups
     WHERE id = ? AND tournament_id = ?
     LIMIT 1`
  ).bind(matchupId, tournamentId).first();

  if (!matchup) {
    throw createError("Matchup not found", 404);
  }

  const results = await env.DB.prepare(
    `SELECT selected_song_id, COUNT(*) AS votes
     FROM votes
     WHERE matchup_id = ?
     GROUP BY selected_song_id`
  ).bind(matchupId).all();

  const counts = {
    [matchup.song_a_id]: 0,
    [matchup.song_b_id]: 0
  };

  for (const row of results.results || []) {
    counts[row.selected_song_id] = Number(row.votes);
  }

  let winnerId = forcedWinnerId;

  if (!winnerId) {
    const aVotes = counts[matchup.song_a_id];
    const bVotes = counts[matchup.song_b_id];

    if (aVotes === bVotes) {
      throw createError(
        "Voting is tied. The host must choose the tie winner.",
        409,
        {
          tie: true,
          songAId: matchup.song_a_id,
          songBId: matchup.song_b_id,
          songAVotes: aVotes,
          songBVotes: bVotes
        }
      );
    }

    winnerId = aVotes > bVotes
      ? matchup.song_a_id
      : matchup.song_b_id;
  }

  if (![matchup.song_a_id, matchup.song_b_id].includes(winnerId)) {
    throw createError("Winner must be one of the songs in this matchup", 400);
  }

  const loserId = winnerId === matchup.song_a_id
    ? matchup.song_b_id
    : matchup.song_a_id;

  const timing = phaseTiming(RESULT_HOLD_SECONDS);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE matchups
       SET winner_song_id = ?,
           status = 'completed',
           completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(winnerId, matchupId),

    env.DB.prepare(
      `UPDATE tournament_songs
       SET wins = wins + 1
       WHERE tournament_id = ? AND song_id = ?`
    ).bind(tournamentId, winnerId),

    env.DB.prepare(
      `UPDATE tournament_songs
       SET losses = losses + 1,
           eliminated = CASE
             WHEN ? = 'double_elimination' AND losses + 1 >= 2 THEN 1
             ELSE eliminated
           END
       WHERE tournament_id = ? AND song_id = ?`
    ).bind(tournament.tournament_type, tournamentId, loserId),

    env.DB.prepare(
      `UPDATE tournaments
       SET state = 'results',
           phase_detail = 'results',
           phase_started_at = ?,
           phase_ends_at = ?
       WHERE id = ?`
    ).bind(timing.startedAt, timing.endsAt, tournamentId)
  ]);

  return getPublicState(env);
}

export async function advanceTournament(tournamentId, env) {
  const tournament = await env.DB.prepare(
    `SELECT id, tournament_type, current_matchup_id, state
     FROM tournaments
     WHERE id = ? AND status = 'active'
     LIMIT 1`
  ).bind(tournamentId).first();

  if (!tournament) {
    throw createError("No active tournament", 409);
  }

  if (tournament.state !== "results") {
    throw createError("Current matchup results have not been finalized", 409);
  }

  let nextMatchupId = null;

  if (tournament.tournament_type === "round_robin") {
    nextMatchupId = await env.DB.prepare(
      `SELECT id
       FROM matchups
       WHERE tournament_id = ? AND status = 'pending'
       ORDER BY sequence
       LIMIT 1`
    ).bind(tournamentId).first("id");
  } else {
    const next = await createNextDoubleEliminationMatch(tournamentId, env);

    if (next.completed) {
      await finishTournament(tournamentId, env);
      return getPublicState(env);
    }

    nextMatchupId = next.matchupId;
  }

  if (!nextMatchupId) {
    await finishTournament(tournamentId, env);
    return getPublicState(env);
  }

  const timing = phaseTiming();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE tournaments
       SET current_matchup_id = ?,
           state = 'waiting',
           phase_detail = 'ready',
           phase_started_at = ?,
           phase_ends_at = NULL
       WHERE id = ?`
    ).bind(nextMatchupId, timing.startedAt, tournamentId),

    env.DB.prepare(
      "UPDATE matchups SET status = 'active' WHERE id = ?"
    ).bind(nextMatchupId)
  ]);

  return getPublicState(env);
}

export async function finishTournament(tournamentId, env) {
  await env.DB.prepare(
    `UPDATE tournaments
     SET status = 'completed',
         state = 'completed',
         current_matchup_id = NULL,
         phase_detail = 'completed',
         phase_started_at = CURRENT_TIMESTAMP,
         phase_ends_at = NULL,
         completed_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(tournamentId).run();
}

export async function deleteCurrentTournament(tournamentId, env) {
  const result = await env.DB.prepare(
    `DELETE FROM tournaments
     WHERE id = ? AND status != 'completed'`
  ).bind(tournamentId).run();

  if (Number(result.meta?.changes || 0) === 0) {
    throw createError("Tournament not found or already completed", 404);
  }
}

export async function getStandings(tournamentId, env) {
  const result = await env.DB.prepare(
    `SELECT
       ts.song_id AS id,
       s.title,
       s.artist,
       ts.wins,
       ts.losses,
       ts.eliminated
     FROM tournament_songs ts
     JOIN songs s ON s.id = ts.song_id
     WHERE ts.tournament_id = ?
     ORDER BY ts.wins DESC, ts.losses ASC, ts.seed ASC`
  ).bind(tournamentId).all();

  return result.results || [];
}

function publicTournament(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    tournamentType: tournament.tournament_type,
    status: tournament.status,
    state: tournament.state,
    phaseDetail: tournament.phase_detail || null,
    phaseStartedAt: tournament.phase_started_at || null,
    phaseEndsAt: tournament.phase_ends_at || null
  };
}

export async function getPublicState(env, audienceId = null) {
  const serverNow = new Date().toISOString();

  let tournament = await env.DB.prepare(
    `SELECT *
     FROM tournaments
     WHERE status IN ('setup', 'active')
     ORDER BY created_at DESC
     LIMIT 1`
  ).first();

  if (!tournament) {
    tournament = await env.DB.prepare(
      `SELECT *
       FROM tournaments
       WHERE status = 'completed'
       ORDER BY completed_at DESC
       LIMIT 1`
    ).first();

    if (!tournament) {
      return {
        serverNow,
        tournament: null,
        matchup: null,
        audienceCount: 0,
        votesSubmitted: 0,
        viewerJoined: false,
        viewerVoted: false,
        voteCounts: null,
        standings: null
      };
    }

    return {
      serverNow,
      tournament: publicTournament(tournament),
      matchup: null,
      audienceCount: 0,
      votesSubmitted: 0,
      viewerJoined: false,
      viewerVoted: false,
      voteCounts: null,
      standings: await getStandings(tournament.id, env)
    };
  }

  const matchup = tournament.current_matchup_id
    ? await getCurrentMatchup(
        tournament.id,
        tournament.current_matchup_id,
        env
      )
    : null;

  const audienceCount = Number(
    await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM audience_members
       WHERE tournament_id = ?
         AND last_seen_at >= datetime('now', '-${ACTIVE_AUDIENCE_SECONDS} seconds')`
    ).bind(tournament.id).first("count") || 0
  );

  let viewerJoined = false;
  let votesSubmitted = 0;
  let viewerVoted = false;
  let voteCounts = null;

  if (audienceId) {
    viewerJoined = Boolean(
      await env.DB.prepare(
        `SELECT id
         FROM audience_members
         WHERE id = ? AND tournament_id = ?
         LIMIT 1`
      ).bind(audienceId, tournament.id).first()
    );
  }

  if (matchup) {
    votesSubmitted = Number(
      await env.DB.prepare(
        `SELECT COUNT(*) AS count
         FROM votes
         WHERE matchup_id = ?`
      ).bind(matchup.id).first("count") || 0
    );

    if (audienceId) {
      viewerVoted = Boolean(
        await env.DB.prepare(
          `SELECT id
           FROM votes
           WHERE matchup_id = ? AND audience_id = ?
           LIMIT 1`
        ).bind(matchup.id, audienceId).first()
      );
    }

    if (tournament.state === "results") {
      const rows = await env.DB.prepare(
        `SELECT selected_song_id, COUNT(*) AS votes
         FROM votes
         WHERE matchup_id = ?
         GROUP BY selected_song_id`
      ).bind(matchup.id).all();

      voteCounts = {
        songA: 0,
        songB: 0
      };

      for (const row of rows.results || []) {
        if (row.selected_song_id === matchup.song_a_id) {
          voteCounts.songA = Number(row.votes);
        } else if (row.selected_song_id === matchup.song_b_id) {
          voteCounts.songB = Number(row.votes);
        }
      }
    }
  }

  return {
    serverNow,
    tournament: publicTournament(tournament),
    matchup: matchup ? {
      id: matchup.id,
      roundNumber: matchup.round_number,
      bracket: matchup.bracket,
      status: matchup.status,
      songA: {
        id: matchup.song_a_id,
        title: matchup.song_a_title,
        artist: null
      },
      songB: {
        id: matchup.song_b_id,
        title: matchup.song_b_title,
        artist: null
      },
      winnerSongId: matchup.winner_song_id
    } : null,
    audienceCount,
    votesSubmitted,
    viewerJoined,
    viewerVoted,
    voteCounts,
    standings: null
  };
}