CREATE TABLE IF NOT EXISTS analises (
    id              SERIAL PRIMARY KEY,
    image_url       TEXT,
    metrics         JSONB NOT NULL,
    scores          JSONB,
    gemini_analysis TEXT,
    plan_status     TEXT NOT NULL DEFAULT 'FREE',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analises_created_at ON analises (created_at DESC);
