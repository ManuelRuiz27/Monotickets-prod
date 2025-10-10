BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('standard', 'premium')),
    status text NOT NULL CHECK (status IN ('draft', 'active', 'archived', 'expired')),
    landing_ttl_days integer NOT NULL DEFAULT 180,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'scanned')),
    confirmation_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    code text NOT NULL,
    links jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invites
    ADD CONSTRAINT invites_code_unique UNIQUE (code);

CREATE TABLE IF NOT EXISTS scan_logs (
    id bigserial PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    guest_id uuid NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    staff_id uuid,
    result text NOT NULL CHECK (result IN ('valid', 'duplicate', 'invalid')),
    ts timestamptz NOT NULL DEFAULT now(),
    device jsonb
)
PARTITION BY LIST (to_char(ts, 'YYYYMM'));

CREATE TABLE IF NOT EXISTS delivery_logs (
    id bigserial PRIMARY KEY,
    organizer_id uuid NOT NULL,
    event_id uuid REFERENCES events(id) ON DELETE SET NULL,
    guest_id uuid REFERENCES guests(id) ON DELETE SET NULL,
    channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
    template text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
    provider_ref text,
    error jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_sessions (
    phone text PRIMARY KEY,
    opened_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);

COMMIT;
