-- Run only after reverting application code. Refuse to discard audit history or voided records.
BEGIN IMMEDIATE;
PRAGMA defer_foreign_keys=ON;
CREATE TEMP TABLE __0030_rollback_guard (violations integer CHECK(violations=0));
INSERT INTO __0030_rollback_guard SELECT count(*) FROM enrollment_audit;
INSERT INTO __0030_rollback_guard SELECT count(*) FROM enrollment WHERE status='voided';
INSERT INTO __0030_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792194219130;
DROP TABLE __0030_rollback_guard;
CREATE TEMP TABLE __0030_subjects AS SELECT * FROM enrollment_subject;
CREATE TEMP TABLE __0030_student_links AS SELECT id,enrollment_id FROM student;
CREATE TEMP TABLE __0030_notification_links AS SELECT id,enrollment_id FROM notification;
DROP TABLE enrollment_audit;
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
	`follow_up_completed_at` integer,
	`meeting_request_started_at` integer,
	`dropped_at` integer,
	`enrolled_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('enrolled', 'dropped', 'completed'))
);

INSERT INTO `__new_enrollment`("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "follow_up_completed_at", "meeting_request_started_at", "dropped_at", "enrolled_at") SELECT "id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "follow_up_completed_at", "meeting_request_started_at", "dropped_at", "enrolled_at" FROM `enrollment`;
DROP TABLE `enrollment`;
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`,`school_year_start`,`semester`) WHERE "enrollment"."status" <> 'dropped';
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`,`semester`);

INSERT OR IGNORE INTO enrollment_subject SELECT * FROM __0030_subjects;
UPDATE student SET enrollment_id=(SELECT enrollment_id FROM __0030_student_links WHERE __0030_student_links.id=student.id);
UPDATE notification SET enrollment_id=(SELECT enrollment_id FROM __0030_notification_links WHERE __0030_notification_links.id=notification.id);
DROP TABLE __0030_subjects;
DROP TABLE __0030_student_links;
DROP TABLE __0030_notification_links;
CREATE TEMP TABLE __0030_fk_check (violations integer CHECK(violations=0));
INSERT INTO __0030_fk_check SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE __0030_fk_check;
PRAGMA defer_foreign_keys=OFF;

DELETE FROM __drizzle_migrations WHERE created_at=1792194219130;
COMMIT;
