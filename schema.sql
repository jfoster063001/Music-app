PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'uploader', 'host')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'Unknown Artist',
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_uploaded_at ON songs(uploaded_at);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('round_robin', 'double_elimination')),
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'completed')),
  state TEXT NOT NULL DEFAULT 'setup'
    CHECK (state IN ('setup', 'waiting', 'song_a', 'song_b', 'voting', 'results', 'completed')),
  current_matchup_id TEXT,
  phase_detail TEXT,
  phase_started_at TEXT,
  phase_ends_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

CREATE TABLE IF NOT EXISTS tournament_songs (
  tournament_id TEXT NOT NULL,
  song_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  eliminated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, song_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id)
);

CREATE TABLE IF NOT EXISTS matchups (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  song_a_id TEXT NOT NULL,
  song_b_id TEXT NOT NULL,
  winner_song_id TEXT,
  round_number INTEGER NOT NULL DEFAULT 1,
  bracket TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (song_a_id) REFERENCES songs(id),
  FOREIGN KEY (song_b_id) REFERENCES songs(id),
  FOREIGN KEY (winner_song_id) REFERENCES songs(id)
);

CREATE INDEX IF NOT EXISTS idx_matchups_tournament_status
  ON matchups(tournament_id, status, sequence);

CREATE TABLE IF NOT EXISTS audience_members (
  id TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  display_name TEXT,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, tournament_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  matchup_id TEXT NOT NULL,
  audience_id TEXT NOT NULL,
  selected_song_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (matchup_id) REFERENCES matchups(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_song_id) REFERENCES songs(id),
  UNIQUE (matchup_id, audience_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_matchup ON votes(matchup_id);

CREATE TABLE IF NOT EXISTS upload_codes (

  code TEXT PRIMARY KEY,

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  reserved_at TEXT,

  used_at TEXT,

  used_song_id TEXT,

  FOREIGN KEY (used_song_id)
    REFERENCES songs(id)
);

CREATE INDEX IF NOT EXISTS idx_upload_codes_used_at ON upload_codes(used_at);
CREATE INDEX IF NOT EXISTS idx_upload_codes_reserved_at ON upload_codes(reserved_at);
