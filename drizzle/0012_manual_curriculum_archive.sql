ALTER TABLE `curriculum` ADD `archived_at` integer;--> statement-breakpoint
-- Preserve the previous Archived status of unselected published versions.
UPDATE `curriculum`
SET `archived_at` = `published_at`
WHERE `published_at` IS NOT NULL AND NOT EXISTS (
	SELECT 1 FROM `program` WHERE `active_curriculum_id` = `curriculum`.`id`
);
