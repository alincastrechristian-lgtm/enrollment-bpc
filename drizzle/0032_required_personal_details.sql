-- Fresh-database transition: required names and demographics cannot be inferred safely.
-- Reset the disposable database before migrating. Never delete existing records here.
CREATE TEMP TABLE __0032_reset_required (existing_accounts integer CONSTRAINT reset_required_for_required_personal_details CHECK(existing_accounts=0));--> statement-breakpoint
INSERT INTO __0032_reset_required SELECT count(*) FROM user;--> statement-breakpoint
INSERT INTO __0032_reset_required SELECT count(*) FROM student;--> statement-breakpoint
DROP TABLE __0032_reset_required;--> statement-breakpoint
CREATE TABLE `__new_student` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`contact_number` text DEFAULT '' NOT NULL,
	`birth_date` text NOT NULL,
	`sex` text NOT NULL,
	`enrollment_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollment`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_student`("id", "user_id", "address", "contact_number", "birth_date", "sex", "enrollment_id", "created_at") SELECT "id", "user_id", "address", "contact_number", "birth_date", "sex", "enrollment_id", "created_at" FROM `student`;--> statement-breakpoint
DROP TABLE `student`;--> statement-breakpoint
ALTER TABLE `__new_student` RENAME TO `student`;--> statement-breakpoint
CREATE UNIQUE INDEX `student_id_unique` ON `student` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_user_id_unique` ON `student` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `student_enrollment_id_unique` ON `student` (`enrollment_id`);--> statement-breakpoint
ALTER TABLE `user` ADD `first_name` text NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `middle_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `last_name` text NOT NULL;
