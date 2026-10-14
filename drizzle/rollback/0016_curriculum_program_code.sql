-- Stop app, back up database, then run this entire file with the old application version.
-- After success, remove only migration 0016's row from __drizzle_migrations.
-- To reapply, run pnpm db:migrate with the new version. IDs and history are preserved.
BEGIN IMMEDIATE;
PRAGMA defer_foreign_keys=ON;
CREATE TEMP TABLE `__rollback_0016_subjects` AS SELECT * FROM `curriculum_subject`;
CREATE TABLE `__old_curriculum` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`name` text NOT NULL,
	`year_levels` integer DEFAULT 4 NOT NULL,
	`semesters` integer DEFAULT 2 NOT NULL,
	`published_at` integer,
	`archived_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `program`(`id`) ON UPDATE no action ON DELETE restrict
);
INSERT INTO `__old_curriculum` (`id`, `program_id`, `name`, `year_levels`, `semesters`, `published_at`, `archived_at`, `is_active`)
SELECT c.`id`, (SELECT p.`id` FROM `program` p WHERE p.`code` = c.`program_code`),
	c.`name`, c.`year_levels`, c.`semesters`, c.`published_at`, c.`archived_at`, c.`is_active`
FROM `curriculum` c;
DROP TABLE `curriculum`;
ALTER TABLE `__old_curriculum` RENAME TO `curriculum`;
CREATE UNIQUE INDEX `curriculum_program_name_unique` ON `curriculum` (`program_id`, `name`);
INSERT INTO `curriculum_subject` (`id`, `curriculum_id`, `subject_id`, `year_level`, `semester`, `units`, `subject_code`, `subject_name`)
SELECT `id`, `curriculum_id`, `subject_id`, `year_level`, `semester`, `units`, `subject_code`, `subject_name`
FROM `__rollback_0016_subjects` WHERE true
ON CONFLICT (`id`) DO NOTHING;
DROP TABLE `__rollback_0016_subjects`;
CREATE TEMP TABLE `__rollback_0016_foreign_keys` (
	`violations` integer NOT NULL CHECK (`violations` = 0)
);
INSERT INTO `__rollback_0016_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE `__rollback_0016_foreign_keys`;
PRAGMA defer_foreign_keys=OFF;
COMMIT;
