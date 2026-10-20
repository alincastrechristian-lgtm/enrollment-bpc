-- Revert application code first. Export keys and paper approvals before rollback.
-- Refuse to silently erase credentials, non-default policy or approval evidence.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0040_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0040_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792468275092;
INSERT INTO __0040_rollback_guard SELECT count(*) FROM system_settings
 WHERE gemini_api_key IS NOT NULL OR automated_clearance_verification_enabled<>1 OR personal_info_verification_enabled<>1;
INSERT INTO __0040_rollback_guard SELECT count(*) FROM enrollment
 WHERE manual_clearance_verified_at IS NOT NULL OR manual_clearance_verified_by IS NOT NULL OR manual_clearance_verifier_name IS NOT NULL;
DROP TABLE __0040_rollback_guard;
ALTER TABLE enrollment DROP COLUMN manual_clearance_verified_at;
ALTER TABLE enrollment DROP COLUMN manual_clearance_verified_by;
ALTER TABLE enrollment DROP COLUMN manual_clearance_verifier_name;
ALTER TABLE system_settings DROP COLUMN gemini_api_key;
ALTER TABLE system_settings DROP COLUMN automated_clearance_verification_enabled;
ALTER TABLE system_settings DROP COLUMN personal_info_verification_enabled;
DELETE FROM __drizzle_migrations WHERE created_at=1792468275092;
COMMIT;
