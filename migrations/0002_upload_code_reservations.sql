ALTER TABLE upload_codes
ADD COLUMN reserved_at TEXT;

CREATE INDEX IF NOT EXISTS
idx_upload_codes_reserved_at

ON upload_codes(reserved_at);