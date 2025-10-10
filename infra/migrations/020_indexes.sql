BEGIN;

CREATE INDEX IF NOT EXISTS idx_guests_event_status ON guests (event_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS invites_code_unique ON invites (code);

CREATE INDEX IF NOT EXISTS idx_scan_logs_event_ts ON scan_logs (event_id, ts);

CREATE INDEX IF NOT EXISTS idx_scan_logs_guest_ts ON scan_logs (guest_id, ts);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_status_created_at ON delivery_logs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_guest_created_at ON delivery_logs (guest_id, created_at);

COMMIT;
