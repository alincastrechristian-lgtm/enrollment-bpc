-- Revert application code first. Refuse to erase configured prerequisite rules.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0038_rollback_guard (violations integer CHECK(violations=0));
INSERT INTO __0038_rollback_guard SELECT count(*) FROM subject_prerequisite;
INSERT INTO __0038_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792443255177;
DROP TABLE __0038_rollback_guard;
DROP TABLE subject_prerequisite;
DELETE FROM __drizzle_migrations WHERE created_at=1792443255177;
COMMIT;
