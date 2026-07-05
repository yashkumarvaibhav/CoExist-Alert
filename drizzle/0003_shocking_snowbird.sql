CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`responder_id` text,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('admin', 'command', 'guard', 'control'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);