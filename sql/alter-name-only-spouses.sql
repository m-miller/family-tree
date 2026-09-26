-- Run once, in phpMyAdmin, after alter-add-tracking.sql.
--
-- Spouses who weren't in the tree were stored as a name on the marriage row.
-- They now become real people, so they draw a node and can be edited later.
-- Their sex is 'unknown' until you set it, which the tree draws in a neutral
-- colour.

-- 1. Allow 'unknown' as a sex.
ALTER TABLE people
  MODIFY COLUMN sex ENUM('man','woman','unknown') NOT NULL DEFAULT 'unknown';

-- 2. Create a person for each name-only spouse, in the same tree.
INSERT INTO people (tree_id, name, sex)
SELECT m.tree_id, m.spouse_name, 'unknown'
  FROM marriages m
 WHERE m.spouse_id IS NULL
   AND TRIM(m.spouse_name) <> '';

-- 3. Point those marriages at the new rows. Matching on name and tree is safe
--    here because step 2 has just created exactly one row per such marriage.
UPDATE marriages m
  JOIN people p
    ON p.tree_id = m.tree_id
   AND p.name = m.spouse_name
   AND p.sex = 'unknown'
   SET m.spouse_id = p.id,
       m.spouse_name = ''
 WHERE m.spouse_id IS NULL
   AND TRIM(m.spouse_name) <> '';

-- 4. Every marriage now has two real people, so require it and drop the
--    now-unused column.
ALTER TABLE marriages
  MODIFY COLUMN spouse_id INT UNSIGNED NOT NULL,
  DROP COLUMN spouse_name;

-- 5. The tree files need rebuilding to show the new nodes.
UPDATE trees SET changed_at = NOW();
