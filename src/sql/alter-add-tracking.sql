-- Run once, after schema.sql and data.sql, in phpMyAdmin.
-- Tracks when a tree's data last changed and when its JSON file was last
-- written, so the admin pages can tell you a rebuild is due.

ALTER TABLE trees
  ADD COLUMN changed_at DATETIME NULL DEFAULT NULL AFTER root_person_id,
  ADD COLUMN rebuilt_at DATETIME NULL DEFAULT NULL AFTER changed_at;

-- The JSON files currently match the database, so start them level.
UPDATE trees SET changed_at = NOW(), rebuilt_at = NOW();
