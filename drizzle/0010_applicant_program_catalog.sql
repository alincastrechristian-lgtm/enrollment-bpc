-- Existing applicants are disposable seed records; user and student accounts are retained.
DELETE FROM `applicant`;--> statement-breakpoint
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
	FOREIGN KEY (`program`) REFERENCES `program`(`code`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "year_level_range" CHECK("__new_applicant"."year_level" BETWEEN 1 AND 4)
);
--> statement-breakpoint
INSERT INTO `__new_applicant`("id", "user_id", "application_id", "name", "program", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at") SELECT "id", "user_id", "application_id", "name", "program", "year_level", "date_applied", "email", "contact_number", "address", "has_birth_certificate", "has_form_138", "has_good_moral", "has_picture", "created_at", "updated_at" FROM `applicant`;--> statement-breakpoint
DROP TABLE `applicant`;--> statement-breakpoint
ALTER TABLE `__new_applicant` RENAME TO `applicant`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_user_id_unique` ON `applicant` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_application_id_unique` ON `applicant` (`application_id`);
