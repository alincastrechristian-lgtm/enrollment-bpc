-- Remarks are retired. Existing subject attempts start with no grade.
ALTER TABLE `enrollment_subject` ADD COLUMN `grade` real
	CONSTRAINT `enrollment_subject_grade_range`
	CHECK (`grade` IS NULL OR `grade` BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE `enrollment_subject` DROP COLUMN `remarks`;
