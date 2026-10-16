-- Revert application notification code before running this rollback.
-- This removes notification history and read status; academic/account data is preserved.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __rollback_0028_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_0028_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792138793922;
DROP TABLE notification;
DELETE FROM __drizzle_migrations WHERE created_at=1792138793922;
DROP TABLE __rollback_0028_guard;
COMMIT;
