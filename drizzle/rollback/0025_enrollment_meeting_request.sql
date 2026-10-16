-- Removes meeting-request delivery history only. Profiles, enrollments and grades remain.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __rollback_meeting_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_meeting_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1792106217199;
ALTER TABLE enrollment DROP COLUMN meeting_request_started_at;
ALTER TABLE enrollment DROP COLUMN meeting_request_sent_at;
DELETE FROM __drizzle_migrations WHERE created_at = 1792106217199;
DROP TABLE __rollback_meeting_guard;
COMMIT;
