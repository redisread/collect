CREATE TABLE `native_changes` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_changes_entity` ON `native_changes` (`user_id`,`kind`,`entity_id`);--> statement-breakpoint
CREATE INDEX `native_changes_cursor` ON `native_changes` (`user_id`,`sequence`);--> statement-breakpoint
ALTER TABLE `articles` ADD `content_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER native_article_insert AFTER INSERT ON articles
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'article' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'article', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_article_update AFTER UPDATE ON articles WHEN OLD.feed_id IS NOT NEW.feed_id OR OLD.title IS NOT NEW.title OR OLD.url IS NOT NEW.url OR OLD.summary IS NOT NEW.summary OR OLD.author IS NOT NEW.author OR OLD.published_at IS NOT NEW.published_at OR OLD.image_url IS NOT NEW.image_url OR OLD.is_read IS NOT NEW.is_read OR OLD.is_starred IS NOT NEW.is_starred OR OLD.is_read_later IS NOT NEW.is_read_later OR OLD.reading_progress IS NOT NEW.reading_progress OR OLD.content IS NOT NEW.content OR OLD.is_extracted IS NOT NEW.is_extracted OR OLD.retention_grace_until IS NOT NEW.retention_grace_until OR OLD.created_at IS NOT NEW.created_at
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'article' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'article', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_article_delete AFTER DELETE ON articles
BEGIN
  DELETE FROM native_changes WHERE user_id = OLD.user_id AND kind = 'article' AND entity_id = OLD.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT OLD.user_id, 'article', OLD.id, 1
    WHERE EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_feed_insert AFTER INSERT ON feeds
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'feed' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'feed', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_feed_update AFTER UPDATE ON feeds WHEN OLD.title IS NOT NEW.title OR OLD.folder_id IS NOT NEW.folder_id OR OLD.feed_url IS NOT NEW.feed_url OR OLD.auto_extract IS NOT NEW.auto_extract OR OLD.sort_order IS NOT NEW.sort_order
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'feed' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'feed', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_feed_delete AFTER DELETE ON feeds
BEGIN
  DELETE FROM native_changes WHERE user_id = OLD.user_id AND kind = 'feed' AND entity_id = OLD.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT OLD.user_id, 'feed', OLD.id, 1
    WHERE EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_folder_insert AFTER INSERT ON folders
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'folder' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'folder', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_folder_update AFTER UPDATE ON folders WHEN OLD.name IS NOT NEW.name OR OLD.sort_order IS NOT NEW.sort_order
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'folder' AND entity_id = NEW.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'folder', NEW.id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_folder_delete AFTER DELETE ON folders
BEGIN
  DELETE FROM native_changes WHERE user_id = OLD.user_id AND kind = 'folder' AND entity_id = OLD.id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT OLD.user_id, 'folder', OLD.id, 1
    WHERE EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_preferences_insert AFTER INSERT ON user_preferences
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'preferences' AND entity_id = NEW.user_id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'preferences', NEW.user_id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_preferences_update AFTER UPDATE ON user_preferences WHEN OLD.article_retention_days IS NOT NEW.article_retention_days OR OLD.translation_target_language IS NOT NEW.translation_target_language
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'preferences' AND entity_id = NEW.user_id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'preferences', NEW.user_id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_preferences_delete AFTER DELETE ON user_preferences
BEGIN
  DELETE FROM native_changes WHERE user_id = OLD.user_id AND kind = 'preferences' AND entity_id = OLD.user_id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT OLD.user_id, 'preferences', OLD.user_id, 1
    WHERE EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_article_content_version AFTER UPDATE OF content ON articles
WHEN OLD.content IS NOT NEW.content
BEGIN
  UPDATE articles SET content_version = OLD.content_version + 1 WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER native_user_insert AFTER INSERT ON user
BEGIN
  INSERT INTO native_changes(user_id, kind, entity_id) VALUES (NEW.id, 'preferences', NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER native_retention_insert AFTER INSERT ON user_preferences
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'article' AND entity_id IN (SELECT id FROM articles WHERE user_id = NEW.user_id);
  INSERT INTO native_changes(user_id, kind, entity_id)
    SELECT user_id, 'article', id FROM articles WHERE user_id = NEW.user_id AND EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_retention_update AFTER UPDATE ON user_preferences WHEN OLD.article_retention_days IS NOT NEW.article_retention_days
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'article' AND entity_id IN (SELECT id FROM articles WHERE user_id = NEW.user_id);
  INSERT INTO native_changes(user_id, kind, entity_id)
    SELECT user_id, 'article', id FROM articles WHERE user_id = NEW.user_id AND EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER native_retention_delete AFTER DELETE ON user_preferences
BEGIN
  DELETE FROM native_changes WHERE user_id = OLD.user_id AND kind = 'article' AND entity_id IN (SELECT id FROM articles WHERE user_id = OLD.user_id);
  INSERT INTO native_changes(user_id, kind, entity_id)
    SELECT user_id, 'article', id FROM articles WHERE user_id = OLD.user_id AND EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id);
END;
--> statement-breakpoint
INSERT INTO native_changes(user_id, kind, entity_id) SELECT user_id, 'article', id FROM articles;
--> statement-breakpoint
INSERT INTO native_changes(user_id, kind, entity_id) SELECT user_id, 'feed', id FROM feeds;
--> statement-breakpoint
INSERT INTO native_changes(user_id, kind, entity_id) SELECT user_id, 'folder', id FROM folders;
--> statement-breakpoint
INSERT INTO native_changes(user_id, kind, entity_id) SELECT id, 'preferences', id FROM user;
