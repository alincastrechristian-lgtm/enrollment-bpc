-- Apply while the development app is stopped. Preserve records while rekeying students.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_student` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`applicant_id` text,
	`enrollment_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE restrict,
	FOREIGN KEY (`applicant_id`) REFERENCES `applicant`(`id`) ON DELETE restrict,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `__new_student` (`id`, `user_id`, `applicant_id`, `created_at`)
SELECT s.`studentId`, s.`user_id`,
	(SELECT a.`id` FROM `applicant` a WHERE a.`user_id` = s.`user_id`),
	(SELECT u.`created_at` FROM `user` u WHERE u.`id` = s.`user_id`)
FROM `student` s;--> statement-breakpoint
-- Rebuild enrollments to avoid transient unique-key collisions while remapping IDs.
-- Existing timestamps and pending flags remain unchanged.
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
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON DELETE restrict,
	CONSTRAINT `enrollment_year_range` CHECK (`year_level` > 0),
	CONSTRAINT `enrollment_status_valid` CHECK (`status` IN ('pending', 'enrolled', 'cancelled', 'withdrawn'))
);--> statement-breakpoint
INSERT INTO `__new_enrollment` (`id`, `student_id`, `curriculum_id`, `section`, `school_year_start`, `semester`, `is_pending`, `year_level`, `status`, `enrolled_at`)
SELECT e.`id`, (SELECT s.`studentId` FROM `student` s WHERE s.`id` = e.`student_id`),
	e.`curriculum_id`, e.`section`, e.`school_year_start`, e.`semester`, e.`is_pending`,
	e.`year_level`, e.`status`, e.`enrolled_at`
FROM `enrollment` e;--> statement-breakpoint
DROP TABLE `enrollment`;--> statement-breakpoint
DROP TABLE `student`;--> statement-breakpoint
ALTER TABLE `__new_student` RENAME TO `student`;--> statement-breakpoint
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;--> statement-breakpoint
CREATE UNIQUE INDEX `student_id_unique` ON `student` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_user_id_unique` ON `student` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_applicant_id_unique` ON `student` (`applicant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_enrollment_id_unique` ON `student` (`enrollment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`, `school_year_start`, `semester`);--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`, `semester`);--> statement-breakpoint
CREATE TEMP TABLE `__migration_0017_foreign_keys` (
	`violations` integer NOT NULL CHECK (`violations` = 0)
);--> statement-breakpoint
INSERT INTO `__migration_0017_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__migration_0017_foreign_keys`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
