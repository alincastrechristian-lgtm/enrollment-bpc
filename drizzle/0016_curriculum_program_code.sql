-- Apply with the application stopped. IDs and all curriculum history stay intact.
-- Drizzle runs migrations in a transaction; defer constraints while rebuilding.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
-- DROP TABLE invokes ON DELETE CASCADE; preserve subject snapshots before rebuilding.
CREATE TEMP TABLE `__migration_0016_subjects` AS SELECT * FROM `curriculum_subject`;--> statement-breakpoint
CREATE TABLE `__new_curriculum` (
	`id` text PRIMARY KEY NOT NULL,
	`program_code` text NOT NULL,
	`name` text NOT NULL,
	`year_levels` integer DEFAULT 4 NOT NULL,
	`semesters` integer DEFAULT 2 NOT NULL,
	`published_at` integer,
	`archived_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`program_code`) REFERENCES `program`(`code`) ON UPDATE cascade ON DELETE restrict
);--> statement-breakpoint
-- A missing program fails NOT NULL validation instead of discarding its curricula.
INSERT INTO `__new_curriculum` (`id`, `program_code`, `name`, `year_levels`, `semesters`, `published_at`, `archived_at`, `is_active`)
SELECT c.`id`, (SELECT p.`code` FROM `program` p WHERE p.`id` = c.`program_id`),
	c.`name`, c.`year_levels`, c.`semesters`, c.`published_at`, c.`archived_at`, c.`is_active`
FROM `curriculum` c;--> statement-breakpoint
DROP TABLE `curriculum`;--> statement-breakpoint
ALTER TABLE `__new_curriculum` RENAME TO `curriculum`;--> statement-breakpoint
CREATE UNIQUE INDEX `curriculum_program_name_unique` ON `curriculum` (`program_code`, `name`);--> statement-breakpoint
-- If foreign keys were disabled by the caller, these rows already exist.
INSERT INTO `curriculum_subject` (`id`, `curriculum_id`, `subject_id`, `year_level`, `semester`, `units`, `subject_code`, `subject_name`)
SELECT `id`, `curriculum_id`, `subject_id`, `year_level`, `semester`, `units`, `subject_code`, `subject_name`
FROM `__migration_0016_subjects` WHERE true
ON CONFLICT (`id`) DO NOTHING;--> statement-breakpoint
DROP TABLE `__migration_0016_subjects`;--> statement-breakpoint
-- Validate actual references before clearing SQLite's stale deferred violation counter.
CREATE TEMP TABLE `__migration_0016_foreign_keys` (
	`violations` integer NOT NULL CHECK (`violations` = 0)
);--> statement-breakpoint
INSERT INTO `__migration_0016_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__migration_0016_foreign_keys`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
