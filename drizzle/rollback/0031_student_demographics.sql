-- Revert application code first. Never discard recorded birth dates or sex values.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0031_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0031_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792196286272;
INSERT INTO __0031_rollback_guard SELECT count(*) FROM student WHERE birth_date IS NOT NULL OR sex IS NOT NULL;
DROP TABLE __0031_rollback_guard;
ALTER TABLE student DROP COLUMN birth_date;
ALTER TABLE student DROP COLUMN sex;
DELETE FROM __drizzle_migrations WHERE created_at=1792196286272;
COMMIT;
