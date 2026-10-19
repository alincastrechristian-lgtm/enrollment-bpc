CREATE TABLE `clearance_template_version` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`revision` text NOT NULL,
	`semester` integer,
	`school_year_start` integer,
	`active` integer DEFAULT false NOT NULL,
	`activated_at` integer,
	`needs_image_update` integer DEFAULT false NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`definition` text,
	`uploaded_by` text,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "clearance_template_version_term" CHECK(("clearance_template_version"."semester" IS NOT NULL AND "clearance_template_version"."school_year_start" IS NOT NULL AND "clearance_template_version"."semester" IN (1, 2) AND "clearance_template_version"."school_year_start" BETWEEN 2000 AND 2099) OR ("clearance_template_version"."semester" IS NULL AND "clearance_template_version"."school_year_start" IS NULL)),
	CONSTRAINT "clearance_template_version_active" CHECK("clearance_template_version"."active" = 0 OR ("clearance_template_version"."activated_at" IS NOT NULL AND "clearance_template_version"."semester" IS NOT NULL AND "clearance_template_version"."school_year_start" IS NOT NULL AND "clearance_template_version"."needs_image_update" = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clearance_template_version_revision_unique` ON `clearance_template_version` (`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `clearance_template_active_term` ON `clearance_template_version` (`school_year_start`,`semester`) WHERE "clearance_template_version"."active" = 1;
--> statement-breakpoint
-- Preserve the legacy row and object for rollback. Only complete configurations become active.
WITH source AS (
 SELECT *, CASE WHEN json_valid(definition) THEN definition ELSE NULL END AS config
 FROM clearance_template
), terms AS (
 SELECT *, CASE WHEN json_extract(config, '$.semester') IN ('1','2')
   AND json_extract(config, '$.schoolYear') GLOB '20[0-9][0-9]-20[0-9][0-9]'
   AND CAST(substr(json_extract(config, '$.schoolYear'),6,4) AS integer) = CAST(substr(json_extract(config, '$.schoolYear'),1,4) AS integer) + 1
   THEN 1 ELSE 0 END AS has_term FROM source
), migrated AS (
 SELECT *, CASE WHEN has_term = 1 AND json_array_length(config, '$.areas') >= 5
   AND json_array_length(config, '$.officeRows') > 0
   AND NOT EXISTS (SELECT 1 FROM json_each(config, '$.officeRows') WHERE json_extract(value, '$.cleared') IS NULL OR json_extract(value, '$.signature') IS NULL)
   THEN 1 ELSE 0 END AS usable FROM terms
)
INSERT INTO clearance_template_version (id, revision, semester, school_year_start, active, activated_at, needs_image_update, object_key, filename, content_type, size, definition, uploaded_by, uploaded_at)
SELECT id, revision,
 CASE WHEN has_term = 1 THEN CAST(json_extract(config, '$.semester') AS integer) END,
 CASE WHEN has_term = 1 THEN CAST(substr(json_extract(config, '$.schoolYear'),1,4) AS integer) END,
 usable, CASE WHEN usable = 1 THEN uploaded_at END, 0,
 object_key, filename, content_type, size, definition, uploaded_by, uploaded_at FROM migrated;
