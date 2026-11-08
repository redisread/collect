ALTER TABLE `feeds` ADD `unsubscribed_at` text;
--> statement-breakpoint
DROP TRIGGER native_feed_update;
--> statement-breakpoint
CREATE TRIGGER native_feed_update AFTER UPDATE ON feeds
WHEN OLD.title IS NOT NEW.title OR OLD.folder_id IS NOT NEW.folder_id OR OLD.feed_url IS NOT NEW.feed_url
 OR OLD.auto_extract IS NOT NEW.auto_extract OR OLD.sort_order IS NOT NEW.sort_order OR OLD.unsubscribed_at IS NOT NEW.unsubscribed_at
BEGIN
 DELETE FROM native_changes WHERE user_id=NEW.user_id AND kind='feed' AND entity_id=NEW.id;
 INSERT INTO native_changes(user_id,kind,entity_id) VALUES(NEW.user_id,'feed',NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER articles_skip_unsubscribed BEFORE INSERT ON articles
WHEN EXISTS (SELECT 1 FROM feeds WHERE id=NEW.feed_id AND unsubscribed_at IS NOT NULL)
BEGIN
 SELECT RAISE(IGNORE);
END;
