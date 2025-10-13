BEGIN;

DO $$
BEGIN
    ALTER TABLE organizers
        ADD COLUMN slug text GENERATED ALWAYS AS (
            trim(both '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
        ) STORED;
EXCEPTION
    WHEN duplicate_column THEN
        NULL;
END $$;

ALTER TABLE organizers
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS billing jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[],
    ADD COLUMN IF NOT EXISTS account_manager text;

DO $$
BEGIN
    ALTER TABLE organizers
        ADD CONSTRAINT organizers_status_check
        CHECK (status IN ('active', 'suspended', 'archived'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organizers_slug_unique ON organizers (slug);

ALTER TABLE ticket_ledger
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS reference text,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    ALTER TABLE ticket_ledger
        ADD CONSTRAINT ticket_ledger_source_check
        CHECK (source IN ('manual', 'import', 'transfer', 'adjustment'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ticket_ledger_reference_idx ON ticket_ledger (reference) WHERE reference IS NOT NULL;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS processed_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE payments
   SET processed_at = COALESCE(processed_at, created_at)
 WHERE processed_at IS NULL;

DO $$
BEGIN
    ALTER TABLE payments
        ADD CONSTRAINT payments_status_check
        CHECK (status IN ('pending', 'settled', 'failed', 'refunded'));
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

COMMIT;
