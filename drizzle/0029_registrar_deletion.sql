PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_enrollment_subject` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`source` text NOT NULL,
	`curriculum_subject_id` text,
	`grade` real,
	`subject_code` text NOT NULL,
	`subject_name` text NOT NULL,
	`units` real NOT NULL,
	`added_by` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_subject_id`) REFERENCES `curriculum_subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "enrollment_subject_units_positive" CHECK("__new_enrollment_subject"."units" > 0),
	CONSTRAINT "enrollment_subject_grade_range" CHECK("__new_enrollment_subject"."grade" IS NULL OR "__new_enrollment_subject"."grade" BETWEEN 1 AND 5),
	CONSTRAINT "enrollment_subject_source_valid" CHECK("__new_enrollment_subject"."source" IN ('curriculum', 'extra')),
	CONSTRAINT "enrollment_subject_curriculum_source" CHECK("__new_enrollment_subject"."source" != 'curriculum' OR "__new_enrollment_subject"."curriculum_subject_id" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_enrollment_subject`("id", "enrollment_id", "subject_id", "source", "curriculum_subject_id", "grade", "subject_code", "subject_name", "units", "added_by", "added_at") SELECT "id", "enrollment_id", "subject_id", "source", "curriculum_subject_id", "grade", "subject_code", "subject_name", "units", "added_by", "added_at" FROM `enrollment_subject`;--> statement-breakpoint
DROP TABLE `enrollment_subject`;--> statement-breakpoint
ALTER TABLE `__new_enrollment_subject` RENAME TO `enrollment_subject`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_subject_unique` ON `enrollment_subject` (`enrollment_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `enrollment_subject_subject_idx` ON `enrollment_subject` (`subject_id`);