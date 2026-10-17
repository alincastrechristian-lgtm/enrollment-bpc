-- Revert application code first. This reset-only migration can be reversed only before accounts exist.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __0032_rollback_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __0032_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792211273103;
INSERT INTO __0032_rollback_guard SELECT count(*) FROM user;
INSERT INTO __0032_rollback_guard SELECT count(*) FROM student;
DROP TABLE __0032_rollback_guard;
CREATE TABLE __rollback_student (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL REFERENCES user(id) ON DELETE restrict,
	address text DEFAULT '' NOT NULL,
	contact_number text DEFAULT '' NOT NULL,
	birth_date text,
	sex text,
	enrollment_id text REFERENCES enrollment(id) ON DELETE restrict,
	created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
DROP TABLE student;
ALTER TABLE __rollback_student RENAME TO student;
CREATE UNIQUE INDEX student_id_unique ON student(id);
CREATE UNIQUE INDEX student_user_id_unique ON student(user_id);
CREATE UNIQUE INDEX student_enrollment_id_unique ON student(enrollment_id);
ALTER TABLE user DROP COLUMN first_name;
ALTER TABLE user DROP COLUMN middle_name;
ALTER TABLE user DROP COLUMN last_name;
DELETE FROM __drizzle_migrations WHERE created_at=1792211273103;
COMMIT;
