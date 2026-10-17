-- Preserve dependent rows even when the migrator runs inside a transaction with foreign keys enabled.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TEMP TABLE __0030_subjects AS SELECT * FROM enrollment_subject;--> statement-breakpoint
CREATE TEMP TABLE __0030_student_links AS SELECT id,enrollment_id FROM student;--> statement-breakpoint
CREATE TEMP TABLE __0030_notification_links AS SELECT id,enrollment_id FROM notification;--> statement-breakpoint
CREATE TABLE `enrollment_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `enrollment_audit_record_idx` ON `enrollment_audit` (`enrollment_id`,`created_at`);--> statement-breakpoint
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
	`revision` integer DEFAULT 0 NOT NULL,
	`enrolled_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('enrolled', 'dropped', 'completed', 'voided'))
);
--> statement-breakpoint
INSERT INTO `__new_enrollment`("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "follow_up_completed_at", "meeting_request_started_at", "dropped_at", "revision", "enrolled_at") SELECT "id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "follow_up_completed_at", "meeting_request_started_at", "dropped_at", 0, "enrolled_at" FROM `enrollment`;--> statement-breakpoint
DROP TABLE `enrollment`;--> statement-breakpoint
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`,`school_year_start`,`semester`) WHERE "enrollment"."status" NOT IN ('dropped', 'voided');--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`,`semester`);
--> statement-breakpoint
INSERT OR IGNORE INTO enrollment_subject SELECT * FROM __0030_subjects;--> statement-breakpoint
UPDATE student SET enrollment_id=(SELECT enrollment_id FROM __0030_student_links WHERE __0030_student_links.id=student.id);--> statement-breakpoint
UPDATE notification SET enrollment_id=(SELECT enrollment_id FROM __0030_notification_links WHERE __0030_notification_links.id=notification.id);--> statement-breakpoint
DROP TABLE __0030_subjects;--> statement-breakpoint
DROP TABLE __0030_student_links;--> statement-breakpoint
DROP TABLE __0030_notification_links;--> statement-breakpoint
CREATE TEMP TABLE __0030_fk_check (violations integer CHECK(violations=0));--> statement-breakpoint
INSERT INTO __0030_fk_check SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE __0030_fk_check;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
