-- Apply with the application stopped: annual counters have no month to migrate.
-- Keep them intact for rollback rather than assigning an invented month.
ALTER TABLE `applicant_sequence` RENAME TO `applicant_sequence_annual_backup`;--> statement-breakpoint
CREATE TABLE `applicant_sequence` (
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`year`, `month`),
	CONSTRAINT "applicant_sequence_month_range" CHECK("month" BETWEEN 1 AND 12),
	CONSTRAINT "applicant_sequence_number_range" CHECK("last_number" BETWEEN 0 AND 999999)
);
--> statement-breakpoint
-- Existing IDs remain unchanged; resume above any IDs already using the new format.
INSERT INTO `applicant_sequence` (`year`, `month`, `last_number`)
SELECT CAST(substr(`application_id`, 4, 4) AS integer),
	CAST(substr(`application_id`, 8, 2) AS integer),
	MAX(CAST(substr(`application_id`, 11, 6) AS integer))
FROM `applicant`
WHERE `application_id` GLOB 'MA-[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'
	AND CAST(substr(`application_id`, 8, 2) AS integer) BETWEEN 1 AND 12
GROUP BY substr(`application_id`, 4, 6);
-- Rollback storage (stop app first; retain monthly counters for re-deployment):
-- ALTER TABLE applicant_sequence RENAME TO applicant_sequence_monthly_backup;
-- ALTER TABLE applicant_sequence_annual_backup RENAME TO applicant_sequence;
