BEGIN;

CREATE TABLE IF NOT EXISTS ticket_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id uuid NOT NULL,
    event_id uuid,
    kind text NOT NULL CHECK (kind IN ('prepago', 'prestamo')),
    tickets integer NOT NULL CHECK (tickets > 0),
    equiv_json jsonb NOT NULL,
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    method text NOT NULL,
    ref text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
