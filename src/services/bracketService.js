function matchupId() {
  return crypto.randomUUID();
}

export function buildRoundRobinMatchups(tournamentId, songIds) {
  const matches = [];
  let sequence = 1;

  for (let i = 0; i < songIds.length; i++) {
    for (let j = i + 1; j < songIds.length; j++) {
      matches.push({
        id: matchupId(),
        tournamentId,
        songAId: songIds[i],
        songBId: songIds[j],
        roundNumber: sequence,
        bracket: "round_robin",
        sequence
      });
      sequence++;
    }
  }

  return matches;
}

async function alreadyPlayed(tournamentId, songAId, songBId, env) {
  const match = await env.DB.prepare(
    `SELECT id
     FROM matchups
     WHERE tournament_id = ?
       AND (
         (song_a_id = ? AND song_b_id = ?)
         OR
         (song_a_id = ? AND song_b_id = ?)
       )
     LIMIT 1`
  ).bind(
    tournamentId,
    songAId,
    songBId,
    songBId,
    songAId
  ).first();

  return Boolean(match);
}

export async function createNextDoubleEliminationMatch(tournamentId, env) {
  const result = await env.DB.prepare(
    `SELECT song_id, wins, losses, seed
     FROM tournament_songs
     WHERE tournament_id = ? AND eliminated = 0
     ORDER BY losses ASC, wins DESC, seed ASC`
  ).bind(tournamentId).all();

  const songs = result.results || [];

  if (songs.length <= 1) {
    return { completed: true, champion: songs[0] || null };
  }

  let pair = null;

  // Prefer pairing songs with the same number of losses.
  for (let i = 0; i < songs.length && !pair; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      if (songs[i].losses !== songs[j].losses) continue;

      const rematch = await alreadyPlayed(
        tournamentId,
        songs[i].song_id,
        songs[j].song_id,
        env
      );

      if (!rematch) {
        pair = [songs[i], songs[j]];
        break;
      }
    }
  }

  // If every same-loss pairing is a rematch, permit one.
  if (!pair) {
    for (let i = 0; i < songs.length && !pair; i++) {
      for (let j = i + 1; j < songs.length; j++) {
        if (songs[i].losses === songs[j].losses) {
          pair = [songs[i], songs[j]];
          break;
        }
      }
    }
  }

  // Last-resort pairing if the remaining loss groups are uneven.
  if (!pair) pair = [songs[0], songs[1]];

  const sequence = await env.DB.prepare(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
     FROM matchups WHERE tournament_id = ?`
  ).bind(tournamentId).first("next_sequence");

  const id = matchupId();
  const bracket = pair[0].losses === 0 && pair[1].losses === 0
    ? "winners"
    : "losers";

  await env.DB.prepare(
    `INSERT INTO matchups
     (id, tournament_id, song_a_id, song_b_id, round_number, bracket, sequence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    tournamentId,
    pair[0].song_id,
    pair[1].song_id,
    sequence,
    bracket,
    sequence
  ).run();

  return {
    completed: false,
    matchupId: id
  };
}
