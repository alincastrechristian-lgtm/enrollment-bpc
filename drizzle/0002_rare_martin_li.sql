CREATE TABLE `applicant` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`name` text NOT NULL,
	`program` text NOT NULL,
	`year_level` integer NOT NULL,
	`status` text NOT NULL,
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
	CONSTRAINT "year_level_range" CHECK("applicant"."year_level" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applicant_application_id_unique` ON `applicant` (`application_id`);--> statement-breakpoint
CREATE TABLE `applicant_sequence` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL
);
