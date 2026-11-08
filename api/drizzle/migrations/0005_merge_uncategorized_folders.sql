-- Custom SQL migration file, put your code below! --
UPDATE feeds SET folder_id = NULL WHERE folder_id IN (SELECT id FROM folders WHERE trim(name) = '未分类');
--> statement-breakpoint
DELETE FROM folders WHERE trim(name) = '未分类';
--> statement-breakpoint
UPDATE opml_import_items SET folder_name = NULL WHERE trim(folder_name) = '未分类';
