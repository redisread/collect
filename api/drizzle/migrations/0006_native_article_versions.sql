ALTER TABLE `articles` ADD `read_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `star_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `later_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `progress_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER articles_read_version_changed AFTER UPDATE OF is_read ON articles
WHEN OLD.is_read IS NOT NEW.is_read
BEGIN
 UPDATE articles SET read_version = OLD.read_version + 1 WHERE id = NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER articles_star_version_changed AFTER UPDATE OF is_starred ON articles
WHEN OLD.is_starred IS NOT NEW.is_starred
BEGIN
 UPDATE articles SET star_version = OLD.star_version + 1 WHERE id = NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER articles_later_version_changed AFTER UPDATE OF is_read_later ON articles
WHEN OLD.is_read_later IS NOT NEW.is_read_later
BEGIN
 UPDATE articles SET later_version = OLD.later_version + 1 WHERE id = NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER articles_progress_version_changed AFTER UPDATE OF reading_progress ON articles
WHEN OLD.reading_progress IS NOT NEW.reading_progress
BEGIN
 UPDATE articles SET progress_version = OLD.progress_version + 1 WHERE id = NEW.id;
END;
