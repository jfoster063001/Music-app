CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'uploader',
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

    FOREIGN KEY (uploaded_by)
        REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_songs_uploaded_at
ON songs(uploaded_at);

CREATE INDEX IF NOT EXISTS idx_songs_title
ON songs(title);

CREATE INDEX IF NOT EXISTS idx_songs_artist
ON songs(artist);