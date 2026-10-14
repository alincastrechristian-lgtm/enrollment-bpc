ALTER TABLE `program` ADD `active_curriculum_id` text REFERENCES curriculum(id) ON DELETE RESTRICT;--> statement-breakpoint
-- Keep the newest eligible published version current; other published versions are archived.
UPDATE `program`
SET `active_curriculum_id` = (
	SELECT `id` FROM `curriculum`
	WHERE `program_id` = `program`.`id` AND `published_at` IS NOT NULL AND `is_active` = 1
	ORDER BY `published_at` DESC, `id` DESC LIMIT 1
)
WHERE `is_active` = 1;
