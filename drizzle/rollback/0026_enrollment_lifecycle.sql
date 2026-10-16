-- Retains profiles, grades and enrollment records. Refuses duplicate terms.
-- Legacy cancelled/withdrawn states were merged into dropped; rollback represents
-- all dropped records as withdrawn and completed records as enrolled.
BEGIN IMMEDIATE;
PRAGMA defer_foreign_keys=ON;
CREATE TEMP TABLE __rollback_0026_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_0026_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792109527815;
INSERT INTO __rollback_0026_guard SELECT count(*) FROM (
 SELECT student_id,school_year_start,semester FROM enrollment GROUP BY student_id,school_year_start,semester HAVING count(*)>1
);
CREATE TABLE `__new_enrollment` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`curriculum_id` text NOT NULL,
	`section` text NOT NULL,
	`school_year_start` integer NOT NULL,
	`semester` integer NOT NULL,
	`year_level` integer NOT NULL,
	`status` text DEFAULT 'enrolled' NOT NULL,
	`finalized_grades` integer DEFAULT false NOT NULL,
	`submitted_clearance` integer DEFAULT false NOT NULL,
	`meeting_request_sent_at` integer,
	`meeting_request_started_at` integer,
	`enrolled_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('enrolled', 'cancelled', 'withdrawn'))
);
INSERT INTO __new_enrollment("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "meeting_request_started_at", "enrolled_at") SELECT "id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", CASE WHEN status='dropped' THEN 'withdrawn' WHEN status='completed' THEN 'enrolled' ELSE status END, "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "meeting_request_started_at", "enrolled_at" FROM enrollment;
DROP TABLE enrollment;
ALTER TABLE __new_enrollment RENAME TO enrollment;
CREATE UNIQUE INDEX enrollment_student_year_semester_unique ON enrollment(student_id,school_year_start,semester);
CREATE INDEX enrollment_term_idx ON enrollment(school_year_start,semester);
INSERT INTO __rollback_0026_guard SELECT count(*) FROM pragma_foreign_key_check;
DELETE FROM __drizzle_migrations WHERE created_at=1792109527815;
DROP TABLE __rollback_0026_guard;
PRAGMA defer_foreign_keys=OFF;
COMMIT;
