-- Generic key/value settings, admin-editable without a redeploy — starting with the Vertex AI
-- location that GOOGLE_CLOUD_LOCATION used to hardcode. Idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS ai_agent_settings (
  key varchar PRIMARY KEY,
  value varchar NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- Every Gemini 3.x model is global/multi-region only on Vertex AI — a regional location like
-- us-central1 404s on every one of them regardless of which model is configured (confirmed
-- live, 2026-08-27). "global" is correct for both current and any future Gemini 3.x model.
INSERT INTO ai_agent_settings (key, value) VALUES
  ('googleCloudLocation', 'global')
ON CONFLICT (key) DO NOTHING;
