-- Drizzle runs this inside a transaction. Defer reference checks while rebuilding
-- the table so current enrollment links and subject attempts remain intact.
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
	-- Historical records may have no enrollment timestamp; preserve them.
	`enrolled_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
	FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "enrollment_year_range" CHECK("__new_enrollment"."year_level" > 0),
	CONSTRAINT "enrollment_status_valid" CHECK("__new_enrollment"."status" IN ('enrolled', 'cancelled', 'withdrawn'))
);
--> statement-breakpoint
INSERT INTO `__new_enrollment`("id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level", "status", "finalized_grades", "enrolled_at")
SELECT "id", "student_id", "curriculum_id", "section", "school_year_start", "semester", "year_level",
	CASE WHEN "status" = 'pending' THEN 'enrolled' ELSE "status" END,
	"finalized_grades", "enrolled_at" FROM `enrollment`;--> statement-breakpoint
DROP TABLE `enrollment`;--> statement-breakpoint
ALTER TABLE `__new_enrollment` RENAME TO `enrollment`;--> statement-breakpoint
CREATE UNIQUE INDEX `enrollment_student_year_semester_unique` ON `enrollment` (`student_id`,`school_year_start`,`semester`);--> statement-breakpoint
CREATE INDEX `enrollment_term_idx` ON `enrollment` (`school_year_start`,`semester`);--> statement-breakpoint
CREATE TEMP TABLE `__migration_0022_foreign_keys` (
	`violations` integer NOT NULL CHECK (`violations` = 0)
);--> statement-breakpoint
INSERT INTO `__migration_0022_foreign_keys` SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__migration_0022_foreign_keys`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
