CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
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
	CONSTRAINT "alerts_tier_check" CHECK("alerts"."tier" in (1, 2, 3)),
	CONSTRAINT "alerts_channel_check" CHECK("alerts"."channel" in ('siren', 'villager_phone', 'guard_webex', 'control_room', 'blindspot_ops')),
	CONSTRAINT "alerts_status_check" CHECK("alerts"."status" in ('queued', 'sent', 'delivered', 'failed', 'acked'))
);
--> statement-breakpoint
CREATE INDEX `alerts_event_tier_idx` ON `alerts` (`event_id`,`tier`);--> statement-breakpoint
CREATE INDEX `alerts_status_idx` ON `alerts` (`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`state` text NOT NULL,
	`confirmed_at` text,
	`resolved_at` text,
	`species_label` text,
	`lead_signal_id` text NOT NULL,
	`confirm_signal_id` text,
	`first_delivery_at` text,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirm_signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_state_check" CHECK("events"."state" in ('unconfirmed', 'confirmed', 'expired', 'responding', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `events_node_state_idx` ON `events` (`node_id`,`state`);--> statement-breakpoint
CREATE INDEX `events_opened_at_idx` ON `events` (`opened_at`);--> statement-breakpoint
CREATE TABLE `heartbeats` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`at` text NOT NULL,
	`battery_pct` integer NOT NULL,
	`link_quality_pct` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "heartbeats_battery_range" CHECK("heartbeats"."battery_pct" >= 0 and "heartbeats"."battery_pct" <= 100),
	CONSTRAINT "heartbeats_link_range" CHECK("heartbeats"."link_quality_pct" >= 0 and "heartbeats"."link_quality_pct" <= 100)
);
--> statement-breakpoint
CREATE INDEX `heartbeats_node_at_idx` ON `heartbeats` (`node_id`,`at`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`geofence_radius_m` integer NOT NULL,
	`status` text NOT NULL,
	`battery_pct` integer,
	`link_quality_pct` integer,
	`last_heartbeat_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT "nodes_kind_check" CHECK("nodes"."kind" in ('village_boundary', 'rail_crossing', 'waterhole')),
	CONSTRAINT "nodes_status_check" CHECK("nodes"."status" in ('healthy', 'degraded', 'offline')),
	CONSTRAINT "nodes_battery_range" CHECK("nodes"."battery_pct" is null or ("nodes"."battery_pct" >= 0 and "nodes"."battery_pct" <= 100)),
	CONSTRAINT "nodes_link_range" CHECK("nodes"."link_quality_pct" is null or ("nodes"."link_quality_pct" >= 0 and "nodes"."link_quality_pct" <= 100))
);
--> statement-breakpoint
CREATE INDEX `nodes_status_idx` ON `nodes` (`status`);--> statement-breakpoint
CREATE TABLE `outages` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`ops_alerted` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outages_node_started_idx` ON `outages` (`node_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `outages_open_idx` ON `outages` (`node_id`,`ended_at`);--> statement-breakpoint
CREATE TABLE `responders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`tier` integer NOT NULL,
	`webex_email` text,
	`phone_label` text NOT NULL,
	`node_ids` text NOT NULL,
	CONSTRAINT "responders_role_check" CHECK("responders"."role" in ('guard', 'control_room', 'district_officer')),
	CONSTRAINT "responders_tier_check" CHECK("responders"."tier" in (1, 2, 3)),
	CONSTRAINT "responders_node_ids_json" CHECK(json_valid("responders"."node_ids"))
);
--> statement-breakpoint
CREATE INDEX `responders_role_tier_idx` ON `responders` (`role`,`tier`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`responder_id` text NOT NULL,
	`action` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responder_id`) REFERENCES `responders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "responses_action_check" CHECK("responses"."action" in ('acknowledged', 'en_route', 'on_site', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX `responses_event_at_idx` ON `responses` (`event_id`,`at`);--> statement-breakpoint
CREATE INDEX `responses_responder_idx` ON `responses` (`responder_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`confirmation_window_s` integer NOT NULL,
	`confirm_confidence` real NOT NULL,
	`escalation_timeout_s` integer NOT NULL,
	`heartbeat_interval_s` integer NOT NULL,
	`degraded_after_missed` integer NOT NULL,
	`offline_after_missed` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`at` text NOT NULL,
	`source` text NOT NULL,
	`classification` text NOT NULL,
	`confidence` real NOT NULL,
	`snapshot_path` text,
	`event_id` text,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "signals_source_check" CHECK("signals"."source" in ('camera', 'thermal', 'acoustic', 'motion')),
	CONSTRAINT "signals_confidence_range" CHECK("signals"."confidence" >= 0 and "signals"."confidence" <= 1)
);
--> statement-breakpoint
CREATE INDEX `signals_node_at_idx` ON `signals` (`node_id`,`at`);--> statement-breakpoint
CREATE INDEX `signals_event_idx` ON `signals` (`event_id`);