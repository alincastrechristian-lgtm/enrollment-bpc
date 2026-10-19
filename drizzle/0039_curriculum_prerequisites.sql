CREATE TABLE `curriculum_prerequisite` (
	`curriculum_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`prerequisite_id` text NOT NULL,
	PRIMARY KEY(`curriculum_id`, `subject_id`, `prerequisite_id`),
	FOREIGN KEY (`curriculum_id`) REFERENCES `curriculum`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prerequisite_id`) REFERENCES `subject`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "curriculum_prerequisite_not_self" CHECK("curriculum_prerequisite"."subject_id" <> "curriculum_prerequisite"."prerequisite_id")
);
--> statement-breakpoint
CREATE INDEX `curriculum_prerequisite_required_idx` ON `curriculum_prerequisite` (`prerequisite_id`);
--> statement-breakpoint
-- Preserve each existing curriculum's applicable rules before removing global ownership.
INSERT INTO `curriculum_prerequisite` (`curriculum_id`, `subject_id`, `prerequisite_id`)
SELECT cs.`curriculum_id`, sp.`subject_id`, sp.`prerequisite_id`
FROM `subject_prerequisite` sp
JOIN `curriculum_subject` cs ON cs.`subject_id` = sp.`subject_id`;
--> statement-breakpoint
DROP TABLE `subject_prerequisite`;
