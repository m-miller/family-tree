-- Family tree schema
-- MySQL 5.7+ / MariaDB 10.2+, InnoDB, utf8mb4 (names contain ü, ä etc.)
--
-- Three tables describe the data:
--   people    one row per person
--   marriages one row per marriage, linking two people
--   children  which marriage a person is a child of
-- plus `trees`, so the Miller and Horne trees live in one database.
--
-- Dates are stored twice: the original text exactly as written
-- ("27 Mar 1780", "Dec 1843", "1956", "unknown"), and year/month/day
-- columns that are NULL when that part isn't known. Nothing is invented.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS children;
DROP TABLE IF EXISTS marriages;
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS trees;

CREATE TABLE trees (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug            VARCHAR(50)  NOT NULL,           -- 'miller', 'horne'
  title           VARCHAR(150) NOT NULL,           -- page heading
  json_file       VARCHAR(100) NOT NULL,           -- file the rebuild writes
  root_person_id  INT UNSIGNED NULL,               -- person the chart starts from
  changed_at      DATETIME     NULL,               -- data last edited
  rebuilt_at      DATETIME     NULL,               -- JSON file last written
  PRIMARY KEY (id),
  UNIQUE KEY uq_trees_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE people (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tree_id                INT UNSIGNED NOT NULL,
  name                   VARCHAR(150) NOT NULL,    -- no leading asterisk; see `adopted`
  sex                    ENUM('man','woman','unknown') NOT NULL DEFAULT 'unknown',
  adopted                TINYINT(1)   NOT NULL DEFAULT 0,
  is_placeholder         TINYINT(1)   NOT NULL DEFAULT 0,  -- e.g. "8 unnamed children"

  birth_date_text        VARCHAR(60)  NOT NULL DEFAULT '',
  birth_year             SMALLINT     NULL,
  birth_month            TINYINT      NULL,
  birth_day              TINYINT      NULL,
  birthplace_name        VARCHAR(255) NOT NULL DEFAULT '',
  birth_address1         VARCHAR(255) NOT NULL DEFAULT '',
  birth_address2         VARCHAR(255) NOT NULL DEFAULT '',
  birth_city             VARCHAR(255) NOT NULL DEFAULT '',
  birth_state_province   VARCHAR(255) NOT NULL DEFAULT '',
  birth_zip_postal_code  VARCHAR(30)  NOT NULL DEFAULT '',
  birth_country          VARCHAR(255) NOT NULL DEFAULT '',
  birth_source           TEXT         NULL,           -- where the birth details came from

  death_date_text        VARCHAR(60)  NOT NULL DEFAULT '',
  death_year             SMALLINT     NULL,
  death_month            TINYINT      NULL,
  death_day              TINYINT      NULL,
  deathplace_name        VARCHAR(255) NOT NULL DEFAULT '',
  death_address1         VARCHAR(255) NOT NULL DEFAULT '',
  death_address2         VARCHAR(255) NOT NULL DEFAULT '',
  death_city             VARCHAR(255) NOT NULL DEFAULT '',
  death_state_province   VARCHAR(255) NOT NULL DEFAULT '',
  death_zip_postal_code  VARCHAR(30)  NOT NULL DEFAULT '',
  death_country          VARCHAR(255) NOT NULL DEFAULT '',
  death_source           TEXT         NULL,           -- where the death details came from

  buried                 TEXT         NULL,
  buried_link            VARCHAR(1000) NOT NULL DEFAULT '',  -- cemetery map
  buried_grave           VARCHAR(1000) NOT NULL DEFAULT '',  -- Find a Grave
  notes                  TEXT         NULL,
  linked_tree            VARCHAR(50)  NOT NULL DEFAULT '',   -- slug of another tree

  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_people_tree (tree_id),
  KEY idx_people_name (name),
  KEY idx_people_birth_year (birth_year),
  KEY idx_people_death_year (death_year),
  CONSTRAINT fk_people_tree FOREIGN KEY (tree_id) REFERENCES trees (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per marriage. person_id is the spouse the chart hangs the
-- marriage under; ordinal orders multiple marriages for that person.
-- Both spouses are real people; someone who was only ever recorded as a
-- name gets a person row with sex 'unknown'.
CREATE TABLE marriages (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tree_id            INT UNSIGNED NOT NULL,
  person_id          INT UNSIGNED NOT NULL,
  spouse_id          INT UNSIGNED NOT NULL,
  ordinal            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  married_date_text  VARCHAR(60)  NOT NULL DEFAULT '',
  married_year       SMALLINT     NULL,
  married_month      TINYINT      NULL,
  married_day        TINYINT      NULL,
  married_place      VARCHAR(255) NOT NULL DEFAULT '',
  married_city       VARCHAR(255) NOT NULL DEFAULT '',
  married_state      VARCHAR(255) NOT NULL DEFAULT '',
  married_source     TEXT         NULL,               -- where the marriage details came from
  PRIMARY KEY (id),
  UNIQUE KEY uq_marriage_person_ordinal (person_id, ordinal),
  UNIQUE KEY uq_marriage_pair (person_id, spouse_id),
  KEY idx_marriages_tree (tree_id),
  KEY idx_marriages_spouse (spouse_id),
  KEY idx_marriages_year (married_year),
  CONSTRAINT fk_marriages_tree   FOREIGN KEY (tree_id)   REFERENCES trees (id),
  CONSTRAINT fk_marriages_person FOREIGN KEY (person_id) REFERENCES people (id),
  CONSTRAINT fk_marriages_spouse FOREIGN KEY (spouse_id) REFERENCES people (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A person is a child of at most one marriage, so child_id is unique.
CREATE TABLE children (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  marriage_id INT UNSIGNED NOT NULL,
  child_id    INT UNSIGNED NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- birth order as displayed
  PRIMARY KEY (id),
  UNIQUE KEY uq_children_child (child_id),
  KEY idx_children_marriage (marriage_id),
  CONSTRAINT fk_children_marriage FOREIGN KEY (marriage_id) REFERENCES marriages (id) ON DELETE CASCADE,
  CONSTRAINT fk_children_child    FOREIGN KEY (child_id)    REFERENCES people (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE trees
  ADD CONSTRAINT fk_trees_root FOREIGN KEY (root_person_id) REFERENCES people (id);

SET FOREIGN_KEY_CHECKS = 1;