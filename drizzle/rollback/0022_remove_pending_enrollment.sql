-- Restore the previous status options and default. Converted enrollments stay
-- enrolled; their original pending status and retired is_pending values are not retained.
BEGIN IMMEDIATE;
PRAGMA defer_foreign_keys=ON;
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
	`finalized_grades` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON DELETE restrict,
	CONSTRAINT `enrollment_year_range` CHECK (`year_level` > 0),
	CONSTRAINT `enrollment_status_valid` CHECK (`status` IN ('pending', 'enrolled', 'cancelled', 'withdrawn'))
);
INSERT INTO `__new_enrollment` (`id`, `student_id`, `curriculum_id`, `section`, `school_year_start`, `semester`, `is_pending`, `year_level`, `status`, `enrolled_at`, `finalized_grades`)
SELECT `id`, `student_id`, `curriculum_id`, `section`, `school_year_start`, `semester`, `status` = 'pending', `year_level`, `status`, `enrolled_at`, `finalized_grades` FROM `enrollment`;
DROP TABLE `enrollment`;
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`, `school_year_start`, `semester`);
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`, `semester`);
CREATE TEMP TABLE `__rollback_0022_foreign_keys` (`violations` integer NOT NULL CHECK (`violations` = 0));
INSERT INTO `__rollback_0022_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE `__rollback_0022_foreign_keys`;
DELETE FROM `__drizzle_migrations` WHERE `created_at` = 1792091409048;
PRAGMA defer_foreign_keys=OFF;
COMMIT;
