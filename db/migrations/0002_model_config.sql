-- Per-phase Gemini model selection, moved out of env vars and into the DB so it can be
-- changed without a redeploy/restart. Idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS ai_agent_model_config (
  phase varchar PRIMARY KEY,
  model varchar NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_agent_model_config (phase, model) VALUES
  ('parse', 'gemini-3.7-flash'),
  ('design', 'gemini-3.7-flash'),
  ('build', 'gemini-3.7-flash'),
  ('qa', 'gemini-3.7-flash')
ON CONFLICT (phase) DO NOTHING;
