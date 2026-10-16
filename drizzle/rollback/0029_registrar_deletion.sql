-- Run with registrar deletion disabled. Fails safely if deleted authors cannot be restored.
-- On any failure, issue ROLLBACK. Never invent replacement authors to satisfy this guard.
BEGIN IMMEDIATE;
CREATE TEMP TABLE __rollback_0029_guard (violations integer NOT NULL CHECK(violations=0));
INSERT INTO __rollback_0029_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at>1792140954451;
INSERT INTO __rollback_0029_guard SELECT count(*) FROM enrollment_subject WHERE added_by IS NULL;

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
	`added_by` text NOT NULL,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_subject_id`) REFERENCES `curriculum_subject`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_subject_units_positive" CHECK("__new_enrollment_subject"."units" > 0),
	CONSTRAINT "enrollment_subject_grade_range" CHECK("__new_enrollment_subject"."grade" IS NULL OR "__new_enrollment_subject"."grade" BETWEEN 1 AND 5),
	CONSTRAINT "enrollment_subject_source_valid" CHECK("__new_enrollment_subject"."source" IN ('curriculum', 'extra')),
	CONSTRAINT "enrollment_subject_curriculum_source" CHECK("__new_enrollment_subject"."source" != 'curriculum' OR "__new_enrollment_subject"."curriculum_subject_id" IS NOT NULL)
);

INSERT INTO `__new_enrollment_subject`("id", "enrollment_id", "subject_id", "source", "curriculum_subject_id", "grade", "subject_code", "subject_name", "units", "added_by", "added_at") SELECT "id", "enrollment_id", "subject_id", "source", "curriculum_subject_id", "grade", "subject_code", "subject_name", "units", "added_by", "added_at" FROM `enrollment_subject`;
DROP TABLE `enrollment_subject`;
ALTER TABLE `__new_enrollment_subject` RENAME TO `enrollment_subject`;

CREATE UNIQUE INDEX `enrollment_subject_unique` ON `enrollment_subject` (`enrollment_id`,`subject_id`);
CREATE INDEX `enrollment_subject_subject_idx` ON `enrollment_subject` (`subject_id`);
DELETE FROM __drizzle_migrations WHERE created_at=1792140954451;
DROP TABLE __rollback_0029_guard;
COMMIT;
