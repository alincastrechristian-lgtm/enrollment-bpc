ALTER TABLE `student` RENAME COLUMN "student_number" TO "studentId";--> statement-breakpoint
DROP INDEX `student_student_number_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `student_studentId_unique` ON `student` (`studentId`);--> statement-breakpoint
ALTER TABLE `enrollment` ADD `section` text NOT NULL;