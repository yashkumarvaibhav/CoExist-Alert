PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`outage_id` text,
	`tier` integer NOT NULL,
	`channel` text NOT NULL,
	`target_ref` text NOT NULL,
	`status` text NOT NULL,
	`queued_at` text NOT NULL,
	`sent_at` text,
	`delivered_at` text,
	`failed_reason` text,
	`is_live` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outage_id`) REFERENCES `outages`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "alerts_tier_check" CHECK("__new_alerts"."tier" in (1, 2, 3)),
	CONSTRAINT "alerts_channel_check" CHECK("__new_alerts"."channel" in ('siren', 'villager_phone', 'guard_webex', 'control_room', 'blindspot_ops')),
	CONSTRAINT "alerts_status_check" CHECK("__new_alerts"."status" in ('queued', 'sent', 'delivered', 'failed', 'acked')),
	CONSTRAINT "alerts_subject_check" CHECK(("__new_alerts"."event_id" is not null and "__new_alerts"."outage_id" is null) or ("__new_alerts"."event_id" is null and "__new_alerts"."outage_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_alerts`("id", "event_id", "outage_id", "tier", "channel", "target_ref", "status", "queued_at", "sent_at", "delivered_at", "failed_reason", "is_live") SELECT "id", "event_id", NULL, "tier", "channel", "target_ref", "status", "queued_at", "sent_at", "delivered_at", "failed_reason", "is_live" FROM `alerts`;--> statement-breakpoint
DROP TABLE `alerts`;--> statement-breakpoint
ALTER TABLE `__new_alerts` RENAME TO `alerts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `alerts_event_tier_idx` ON `alerts` (`event_id`,`tier`);--> statement-breakpoint
CREATE INDEX `alerts_outage_idx` ON `alerts` (`outage_id`);--> statement-breakpoint
CREATE INDEX `alerts_status_idx` ON `alerts` (`status`);
