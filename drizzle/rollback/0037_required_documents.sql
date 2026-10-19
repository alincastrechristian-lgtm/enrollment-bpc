-- Revert application code first. Refuse rollback after document requests exist.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0037_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0037_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792427921070;
INSERT INTO __0037_rollback_guard SELECT count(*) FROM required_document;
DROP TABLE __0037_rollback_guard;
DROP TABLE required_document;
DELETE FROM __drizzle_migrations WHERE created_at=1792427921070;
COMMIT;
