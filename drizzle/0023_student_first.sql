-- Applicants become student accounts without enrollment. Existing student IDs,
-- enrollment links, grades, and personal details stay intact. Document flags and
-- pre-enrollment academic choices are intentionally retired.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TEMP TABLE `__student_import` AS
SELECT a.*, coalesce(s.user_id, a.user_id, lower(hex(randomblob(16)))) AS account_id
FROM applicant a LEFT JOIN student s ON s.applicant_id = a.id;--> statement-breakpoint
-- Refuse ambiguous identities rather than merge unrelated accounts.
CREATE TEMP TABLE `__student_import_guard` (violations integer NOT NULL CHECK(violations=0));--> statement-breakpoint
INSERT INTO __student_import_guard
SELECT count(*) FROM __student_import i JOIN user u ON u.id=i.account_id WHERE u.role != 'student';--> statement-breakpoint
INSERT INTO __student_import_guard
SELECT count(*) FROM __student_import i JOIN user u ON lower(u.email)=lower(trim(i.email)) AND u.id != i.account_id
WHERE NOT EXISTS (SELECT 1 FROM user own WHERE own.id=i.account_id);--> statement-breakpoint
INSERT INTO user (id,name,email,email_verified,role,setup_complete,created_at,updated_at)
SELECT account_id,name,lower(trim(email)),0,'student',0,created_at,updated_at
FROM __student_import i WHERE NOT EXISTS (SELECT 1 FROM user u WHERE u.id=i.account_id);--> statement-breakpoint
CREATE TABLE `__new_student` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL UNIQUE REFERENCES user(id) ON DELETE restrict,
	`address` text DEFAULT '' NOT NULL,
	`contact_number` text DEFAULT '' NOT NULL,
	`enrollment_id` text UNIQUE REFERENCES enrollment(id) ON DELETE restrict,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);--> statement-breakpoint
INSERT INTO __new_student (id,user_id,address,contact_number,enrollment_id,created_at)
SELECT s.id,s.user_id,coalesce(a.address,''),coalesce(a.contact_number,''),s.enrollment_id,s.created_at
FROM student s LEFT JOIN applicant a ON a.id=coalesce(s.applicant_id,(SELECT id FROM applicant WHERE user_id=s.user_id));--> statement-breakpoint
INSERT INTO __new_student (id,user_id,address,contact_number,created_at)
SELECT i.application_id,i.account_id,i.address,i.contact_number,i.created_at FROM __student_import i
WHERE NOT EXISTS (SELECT 1 FROM __new_student s WHERE s.user_id=i.account_id);--> statement-breakpoint
DROP TABLE student;--> statement-breakpoint
ALTER TABLE __new_student RENAME TO student;--> statement-breakpoint
CREATE UNIQUE INDEX student_id_unique ON student(id);--> statement-breakpoint
CREATE UNIQUE INDEX student_user_id_unique ON student(user_id);--> statement-breakpoint
CREATE UNIQUE INDEX student_enrollment_id_unique ON student(enrollment_id);--> statement-breakpoint
CREATE TABLE student_sequence (
	year integer NOT NULL,
	month integer NOT NULL,
	last_number integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(year,month),
	CONSTRAINT student_sequence_month_range CHECK(month BETWEEN 1 AND 12),
	CONSTRAINT student_sequence_number_range CHECK(last_number BETWEEN 0 AND 999999)
);--> statement-breakpoint
INSERT INTO student_sequence SELECT year,month,last_number FROM applicant_sequence;--> statement-breakpoint
INSERT INTO student_sequence(year,month,last_number)
SELECT cast(substr(id,4,4) AS integer),cast(substr(id,8,2) AS integer),max(cast(substr(id,11,6) AS integer))
FROM student WHERE id GLOB 'MA-[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'
GROUP BY substr(id,4,4),substr(id,8,2)
ON CONFLICT(year,month) DO UPDATE SET last_number=max(student_sequence.last_number,excluded.last_number);--> statement-breakpoint
-- Older accounts created without an applicant also need a student record.
CREATE TEMP TABLE __orphan_student_numbers AS
SELECT u.id AS user_id, row_number() OVER(ORDER BY u.created_at,u.id) + coalesce((
 SELECT last_number FROM student_sequence WHERE year=cast(strftime('%Y','now','+8 hours') AS integer)
 AND month=cast(strftime('%m','now','+8 hours') AS integer)),0) AS number
FROM user u WHERE u.role='student' AND NOT EXISTS(SELECT 1 FROM student s WHERE s.user_id=u.id);--> statement-breakpoint
INSERT INTO __student_import_guard SELECT count(*) FROM __orphan_student_numbers WHERE number>999999;--> statement-breakpoint
INSERT INTO student(id,user_id)
SELECT 'MA-'||strftime('%Y%m','now','+8 hours')||'-'||printf('%06d',number),user_id FROM __orphan_student_numbers;--> statement-breakpoint
INSERT INTO student_sequence(year,month,last_number)
SELECT cast(strftime('%Y','now','+8 hours') AS integer),cast(strftime('%m','now','+8 hours') AS integer),max(number)
FROM __orphan_student_numbers GROUP BY strftime('%Y%m','now','+8 hours')
ON CONFLICT(year,month) DO UPDATE SET last_number=max(student_sequence.last_number,excluded.last_number);--> statement-breakpoint
DROP TABLE __orphan_student_numbers;--> statement-breakpoint
DROP TABLE applicant;--> statement-breakpoint
DROP TABLE applicant_sequence;--> statement-breakpoint
INSERT INTO __student_import_guard SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE __student_import;--> statement-breakpoint
DROP TABLE __student_import_guard;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
