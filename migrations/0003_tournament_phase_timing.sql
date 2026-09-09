ALTER TABLE tournaments ADD COLUMN phase_detail TEXT;
ALTER TABLE tournaments ADD COLUMN phase_started_at TEXT;
ALTER TABLE tournaments ADD COLUMN phase_ends_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tournaments_phase_ends_at
  ON tournaments(phase_ends_at);
