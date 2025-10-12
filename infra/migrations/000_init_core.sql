BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS organizers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact jsonb NOT NULL DEFAULT '{}'::jsonb,
    pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id uuid NOT NULL,
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
    event_id uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'scanned')),
    confirmation_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    code text NOT NULL,
    links jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN guests.status IS 'QR válido solo si status ∈ {confirmed, scanned}.';
COMMENT ON TABLE invites IS 'Invitaciones públicas /public/invite/{code} y /public/confirm/{code}.';

COMMIT;
