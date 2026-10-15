-- Document flags and pre-enrollment academic choices were intentionally removed.
-- They cannot be recovered. Refuse rollback while students lack enrollment,
-- because the old applicant schema requires a program and year level.
-- Personal columns stay on student for compatibility; old code ignores them.
BEGIN IMMEDIATE;
PRAGMA defer_foreign_keys=ON;
CREATE TEMP TABLE __rollback_student_first_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_student_first_guard SELECT count(*) FROM student s
LEFT JOIN enrollment e ON e.id=s.enrollment_id AND e.student_id=s.id
WHERE e.id IS NULL;
CREATE TABLE applicant (
 id text PRIMARY KEY NOT NULL,
 user_id text REFERENCES user(id) ON DELETE set null,
 application_id text NOT NULL,
 name text NOT NULL,
 program_code text NOT NULL REFERENCES program(code) ON UPDATE cascade ON DELETE restrict,
 year_level integer NOT NULL CHECK(year_level>0),
 date_applied integer NOT NULL,
 email text NOT NULL,
 contact_number text NOT NULL,
 address text NOT NULL,
 has_birth_certificate integer DEFAULT false NOT NULL,
 has_form_138 integer DEFAULT false NOT NULL,
 has_good_moral integer DEFAULT false NOT NULL,
 has_picture integer DEFAULT false NOT NULL,
 created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
 updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX applicant_user_id_unique ON applicant(user_id);
CREATE UNIQUE INDEX applicant_application_id_unique ON applicant(application_id);
INSERT INTO applicant(id,user_id,application_id,name,program_code,year_level,date_applied,email,contact_number,address,created_at,updated_at)
SELECT s.id,s.user_id,s.id,u.name,c.program_code,e.year_level,s.created_at,u.email,s.contact_number,s.address,s.created_at,u.updated_at
FROM student s JOIN user u ON u.id=s.user_id JOIN enrollment e ON e.id=s.enrollment_id JOIN curriculum c ON c.id=e.curriculum_id;
ALTER TABLE student ADD COLUMN applicant_id text REFERENCES applicant(id) ON DELETE restrict;
UPDATE student SET applicant_id=id;
CREATE UNIQUE INDEX student_applicant_id_unique ON student(applicant_id);
CREATE TABLE applicant_sequence (
 year integer NOT NULL,month integer NOT NULL,last_number integer DEFAULT 0 NOT NULL,
 PRIMARY KEY(year,month),
 CONSTRAINT applicant_sequence_month_range CHECK(month BETWEEN 1 AND 12),
 CONSTRAINT applicant_sequence_number_range CHECK(last_number BETWEEN 0 AND 999999)
);
INSERT INTO applicant_sequence SELECT * FROM student_sequence;
DROP TABLE student_sequence;
INSERT INTO __rollback_student_first_guard SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE __rollback_student_first_guard;
-- Remove only this migration's journal entry when present.
DELETE FROM __drizzle_migrations WHERE created_at=1792095309005;
PRAGMA defer_foreign_keys=OFF;
COMMIT;
