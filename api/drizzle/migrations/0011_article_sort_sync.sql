CREATE TRIGGER native_article_sort_update AFTER UPDATE OF article_sort_order ON user_preferences
WHEN OLD.article_sort_order IS NOT NEW.article_sort_order
BEGIN
  DELETE FROM native_changes WHERE user_id = NEW.user_id AND kind = 'preferences' AND entity_id = NEW.user_id;
  INSERT INTO native_changes(user_id, kind, entity_id, deleted)
    SELECT NEW.user_id, 'preferences', NEW.user_id, 0
    WHERE EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id);
END;
