CREATE TABLE `subject_prerequisite` (
	`subject_id` text NOT NULL,
	`prerequisite_id` text NOT NULL,
	PRIMARY KEY(`subject_id`, `prerequisite_id`),
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prerequisite_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subject_prerequisite_not_self" CHECK("subject_prerequisite"."subject_id" <> "subject_prerequisite"."prerequisite_id")
);
--> statement-breakpoint
CREATE INDEX `subject_prerequisite_required_idx` ON `subject_prerequisite` (`prerequisite_id`);