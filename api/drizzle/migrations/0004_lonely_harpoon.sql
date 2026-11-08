CREATE TABLE `opml_import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`feed_url` text NOT NULL,
	`site_url` text,
	`folder_name` text,
	`status` text NOT NULL,
	`message` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_dispatch_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `opml_import_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_opml_items_job` ON `opml_import_items` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_opml_items_dispatch` ON `opml_import_items` (`status`,`next_dispatch_at`);--> statement-breakpoint
CREATE TABLE `opml_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_opml_jobs_user_created` ON `opml_import_jobs` (`user_id`,`created_at`);--> statement-breakpoint
DROP INDEX `idx_feeds_url_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feeds_feed_url_user` ON `feeds` (`feed_url`,`user_id`);