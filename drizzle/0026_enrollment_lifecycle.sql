-- Preserve enrollment links and grades while rebuilding the status constraint.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
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
	`dropped_at` integer,
	`enrolled_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('enrolled', 'dropped', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_enrollment`("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "meeting_request_started_at", "dropped_at", "enrolled_at") SELECT "id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", CASE
WHEN "status" IN ('cancelled', 'withdrawn') THEN 'dropped'
WHEN "finalized_grades"=1 AND "submitted_clearance"=1 THEN 'completed'
ELSE "status" END, "finalized_grades", "submitted_clearance", "meeting_request_sent_at", "meeting_request_started_at", NULL, "enrolled_at" FROM `enrollment`;--> statement-breakpoint
DROP TABLE `enrollment`;--> statement-breakpoint
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`,`school_year_start`,`semester`) WHERE "enrollment"."status" <> 'dropped';--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`,`semester`);
--> statement-breakpoint
CREATE TEMP TABLE __migration_0026_foreign_keys (violations integer NOT NULL CHECK(violations=0));--> statement-breakpoint
INSERT INTO __migration_0026_foreign_keys SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE __migration_0026_foreign_keys;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
