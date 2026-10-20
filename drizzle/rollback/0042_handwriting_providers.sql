-- Revert application code first. Guard against discarding provider settings or secrets.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0042_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0042_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792474072612;
INSERT INTO __0042_rollback_guard SELECT count(*) FROM system_settings
WHERE ai_provider<>'gemini' OR openai_api_key<>'' OR openai_model<>'gpt-4.1-mini'
OR ollama_base_url<>'http://localhost:11434' OR ollama_model<>'qwen3-vl:4b';
DROP TABLE __0042_rollback_guard;
ALTER TABLE system_settings DROP COLUMN ollama_model;
ALTER TABLE system_settings DROP COLUMN ollama_base_url;
ALTER TABLE system_settings DROP COLUMN openai_model;
ALTER TABLE system_settings DROP COLUMN openai_api_key;
ALTER TABLE system_settings DROP COLUMN ai_provider;
DELETE FROM __drizzle_migrations WHERE created_at=1792474072612;
COMMIT;
