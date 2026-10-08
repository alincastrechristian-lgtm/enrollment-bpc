CREATE TABLE `academic_term` (
	`id` text PRIMARY KEY NOT NULL,
	`start_year` integer NOT NULL,
	`semester` integer NOT NULL,
	`enrollment_opens_at` integer NOT NULL,
	`enrollment_closes_at` integer NOT NULL,
	CONSTRAINT "academic_term_semester_range" CHECK("academic_term"."semester" BETWEEN 1 AND 3),
	CONSTRAINT "academic_term_enrollment_dates" CHECK("academic_term"."enrollment_closes_at" > "academic_term"."enrollment_opens_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_term_year_semester_unique` ON `academic_term` (`start_year`,`semester`);--> statement-breakpoint
CREATE TABLE `curriculum` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`name` text NOT NULL,
	`published_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `program`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `curriculum_program_name_unique` ON `curriculum` (`program_id`,`name`);--> statement-breakpoint
CREATE TABLE `curriculum_subject` (
	`id` text PRIMARY KEY NOT NULL,
	`curriculum_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`year_level` integer NOT NULL,
	`semester` integer NOT NULL,
	`units` real NOT NULL,
	`subject_code` text NOT NULL,
	`subject_name` text NOT NULL,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "curriculum_subject_year_positive" CHECK("curriculum_subject"."year_level" > 0),
	CONSTRAINT "curriculum_subject_semester_positive" CHECK("curriculum_subject"."semester" > 0),
	CONSTRAINT "curriculum_subject_units_positive" CHECK("curriculum_subject"."units" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `curriculum_subject_unique` ON `curriculum_subject` (`curriculum_id`,`subject_id`);--> statement-breakpoint
CREATE TABLE `enrollment` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`term_id` text NOT NULL,
	`curriculum_id` text NOT NULL,
	`year_level` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`enrolled_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`term_id`) REFERENCES `academic_term`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("enrollment"."year_level" BETWEEN 1 AND 4),
	CONSTRAINT "enrollment_status_valid" CHECK("enrollment"."status" IN ('pending', 'enrolled', 'cancelled', 'withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_term_unique` ON `enrollment` (`student_id`,`term_id`);--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`term_id`);--> statement-breakpoint
CREATE TABLE `enrollment_subject` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`curriculum_subject_id` text,
	`source` text DEFAULT 'curriculum' NOT NULL,
	`remarks` text,
	`subject_code` text NOT NULL,
	`subject_name` text NOT NULL,
	`units` real NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_subject_id`) REFERENCES `curriculum_subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_subject_units_positive" CHECK("enrollment_subject"."units" > 0),
	CONSTRAINT "enrollment_subject_source_valid" CHECK("enrollment_subject"."source" IN ('curriculum', 'extra')),
	CONSTRAINT "enrollment_subject_curriculum_source" CHECK("enrollment_subject"."source" != 'curriculum' OR "enrollment_subject"."curriculum_subject_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_subject_unique` ON `enrollment_subject` (`enrollment_id`,`subject_id`);--> statement-breakpoint
CREATE INDEX `enrollment_subject_subject_idx` ON `enrollment_subject` (`subject_id`);--> statement-breakpoint
CREATE TABLE `program` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_code_unique` ON `program` (`code`);--> statement-breakpoint
CREATE TABLE `student` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`student_number` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_user_id_unique` ON `student` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_student_number_unique` ON `student` (`student_number`);--> statement-breakpoint
CREATE TABLE `subject` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subject_code_unique` ON `subject` (`code`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applicant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`application_id` text NOT NULL,
	`name` text NOT NULL,
	`program` text NOT NULL,
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
	CONSTRAINT "year_level_range" CHECK("__new_applicant"."year_level" BETWEEN 1 AND 4)
);
--> statement-breakpoint
INSERT INTO `__new_applicant`("id", "user_id", "application_id", "name", "program", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at") SELECT "id", "user_id", "application_id", "name", "program", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at" FROM `applicant`;--> statement-breakpoint
DROP TABLE `applicant`;--> statement-breakpoint
ALTER TABLE `__new_applicant` RENAME TO `applicant`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_user_id_unique` ON `applicant` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_application_id_unique` ON `applicant` (`application_id`);