-- Revert application code first. Preserve any deliberately selected non-default model.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0041_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0041_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792471701624;
INSERT INTO __0041_rollback_guard SELECT count(*) FROM system_settings WHERE gemini_model<>'gemini-3.1-flash-lite';
DROP TABLE __0041_rollback_guard;
ALTER TABLE system_settings DROP COLUMN gemini_model;
DELETE FROM __drizzle_migrations WHERE created_at=1792471701624;
COMMIT;
