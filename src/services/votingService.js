import { getPublicState } from "./tournamentService.js";

export async function joinAudience({ audienceId, displayName }, env) {
  const tournament = await env.DB.prepare(
    `SELECT id
     FROM tournaments
     WHERE status IN ('setup', 'active')
     ORDER BY created_at DESC
     LIMIT 1`
  ).first();

  if (!tournament) {
    const error = new Error("There is no tournament to join");
    error.status = 409;
    throw error;
  }

  await env.DB.prepare(
    `INSERT INTO audience_members
     (id, tournament_id, display_name)
     VALUES (?, ?, ?)
     ON CONFLICT(id, tournament_id)
     DO UPDATE SET
       display_name = excluded.display_name,
       last_seen_at = CURRENT_TIMESTAMP`
  ).bind(
    audienceId,
    tournament.id,
    (displayName || "").trim() || null
  ).run();

  return getPublicState(env, audienceId);
}

export async function submitVote({ audienceId, matchupId, selectedSongId }, env) {
  const tournament = await env.DB.prepare(
    `SELECT id, state, current_matchup_id
     FROM tournaments
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`
  ).first();

  if (!tournament) {
    const error = new Error("No active tournament");
    error.status = 409;
    throw error;
  }

  if (tournament.state !== "voting") {
    const error = new Error("Voting is not open");
    error.status = 409;
    throw error;
  }

  if (tournament.current_matchup_id !== matchupId) {
    const error = new Error("That matchup is no longer active");
    error.status = 409;
    throw error;
  }

  const matchup = await env.DB.prepare(
    `SELECT song_a_id, song_b_id
     FROM matchups
     WHERE id = ? AND tournament_id = ?
     LIMIT 1`
  ).bind(matchupId, tournament.id).first();

  if (!matchup) throw new Error("Matchup not found");

  if (![matchup.song_a_id, matchup.song_b_id].includes(selectedSongId)) {
    throw new Error("Invalid song selection");
  }

  const member = await env.DB.prepare(
    `SELECT id
     FROM audience_members
     WHERE id = ? AND tournament_id = ?
     LIMIT 1`
  ).bind(audienceId, tournament.id).first();

  if (!member) {
    const error = new Error("Join the audience before voting");
    error.status = 401;
    throw error;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO votes
       (id, tournament_id, matchup_id, audience_id, selected_song_id)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      tournament.id,
      matchupId,
      audienceId,
      selectedSongId
    ).run();
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      const duplicate = new Error("You already voted in this matchup");
      duplicate.status = 409;
      throw duplicate;
    }
    throw error;
  }

  await env.DB.prepare(
    `UPDATE audience_members
     SET last_seen_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tournament_id = ?`
  ).bind(audienceId, tournament.id).run();

  return getPublicState(env, audienceId);
}
