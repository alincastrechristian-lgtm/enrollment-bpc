-- Removes follow-up completion timestamps only; grades and enrollment history remain.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __rollback_0027_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_0027_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792110108461;
ALTER TABLE enrollment DROP COLUMN follow_up_completed_at;
DELETE FROM __drizzle_migrations WHERE created_at=1792110108461;
DROP TABLE __rollback_0027_guard;
COMMIT;
