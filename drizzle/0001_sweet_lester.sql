CREATE TABLE `villager_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `villager_zones_label_idx` ON `villager_zones` (`label`);