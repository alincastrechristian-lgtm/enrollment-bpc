-- Keep academic_term for historical enrollment windows and rollback.
-- Drizzle runs this migration inside a transaction, where foreign_keys=OFF has no effect.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_applicant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`application_id` text NOT NULL,
	`name` text NOT NULL,
	`program_code` text NOT NULL,
	`year_level` integer NOT NULL,
	`date_applied` integer NOT NULL,
	`email` text NOT NULL,
	`contact_number` text NOT NULL,
	`address` text NOT NULL,
	`has_birth_certificate` integer DEFAULT false NOT NULL,
	`has_form_138` integer DEFAULT false NOT NULL,
	`has_good_moral` integer DEFAULT false NOT NULL,
	`has_picture` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_code`) REFERENCES `program`(`code`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "year_level_range" CHECK("__new_applicant"."year_level" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_applicant`("id", "user_id", "application_id", "name", "program_code", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at") SELECT "id", "user_id", "application_id", "name", "program", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at" FROM `applicant`;--> statement-breakpoint
DROP TABLE `applicant`;--> statement-breakpoint
ALTER TABLE `__new_applicant` RENAME TO `applicant`;--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_user_id_unique` ON `applicant` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_application_id_unique` ON `applicant` (`application_id`);--> statement-breakpoint
CREATE TABLE `__new_enrollment` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`curriculum_id` text NOT NULL,
	`section` text NOT NULL,
	`school_year_start` integer NOT NULL,
	`semester` integer NOT NULL,
	`is_pending` integer DEFAULT true NOT NULL,
	`year_level` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`enrolled_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('pending', 'enrolled', 'cancelled', 'withdrawn'))
);
--> statement-breakpoint
-- Scalar lookups fail NOT NULL validation if an enrollment has no matching term;
-- an inner join would silently discard that enrollment.
INSERT INTO `__new_enrollment`("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "is_pending", "year_level", "status", "enrolled_at")
SELECT e."id", e."student_id", e."curriculum_id", e."section",
	(SELECT t."start_year" FROM `academic_term` t WHERE t."id" = e."term_id"),
	(SELECT t."semester" FROM `academic_term` t WHERE t."id" = e."term_id"),
	e."status" = 'pending', e."year_level", e."status", e."enrolled_at"
FROM `enrollment` e;--> statement-breakpoint
DROP TABLE `enrollment`;--> statement-breakpoint
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`,`school_year_start`,`semester`);--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`,`semester`);--> statement-breakpoint
-- Rebuilding a referenced table leaves SQLite's deferred violation counter stale.
-- Validate every actual foreign key before clearing that counter; failure rolls back.
CREATE TEMP TABLE `__migration_0014_foreign_keys` (
	`violations` integer NOT NULL,
	CONSTRAINT `migration_0014_foreign_keys_valid` CHECK (`violations` = 0)
);--> statement-breakpoint
INSERT INTO `__migration_0014_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__migration_0014_foreign_keys`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
