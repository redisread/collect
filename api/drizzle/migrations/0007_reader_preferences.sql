CREATE TABLE `expired_article_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expired_article_feed_url` ON `expired_article_urls` (`feed_id`,`url`);--> statement-breakpoint
ALTER TABLE `articles` ADD `retention_grace_until` text;--> statement-breakpoint
ALTER TABLE `feeds` ADD `auto_extract` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE articles SET retention_grace_until = datetime('now', '+30 days'), created_at = coalesce(created_at, datetime('now'));
--> statement-breakpoint
UPDATE user_preferences SET article_retention_days = 30 WHERE article_retention_days NOT IN (7,30,60,90) OR article_retention_days IS NULL;
--> statement-breakpoint
CREATE TRIGGER articles_protection_removed AFTER UPDATE OF is_starred, is_read_later ON articles
WHEN (coalesce(OLD.is_starred,0) = 1 OR coalesce(OLD.is_read_later,0) = 1)
 AND coalesce(NEW.is_starred,0) = 0 AND coalesce(NEW.is_read_later,0) = 0
BEGIN
 UPDATE articles SET retention_grace_until = max(coalesce(OLD.retention_grace_until,''), datetime('now','+7 days')) WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER articles_remember_expired BEFORE DELETE ON articles
WHEN EXISTS (SELECT 1 FROM feeds WHERE id = OLD.feed_id)
BEGIN
 INSERT OR IGNORE INTO expired_article_urls(id,feed_id,url) VALUES (OLD.id,OLD.feed_id,OLD.url);
END;
--> statement-breakpoint
CREATE TRIGGER articles_skip_expired BEFORE INSERT ON articles
WHEN EXISTS (SELECT 1 FROM expired_article_urls WHERE feed_id = NEW.feed_id AND url = NEW.url)
BEGIN
 SELECT RAISE(IGNORE);
END;
