-- A date for the burial, alongside birth and death. Church books before civil
-- registration often record a burial and no death, so for many older ancestors
-- this is the only date there is.
--
-- Stored like the other dates: the text exactly as written, plus year, month
-- and day (NULL where a part isn't known) for sorting and for the map.
--
-- Run this BEFORE deploying the code that uses it: saving a person writes
-- these columns, and fails if they do not exist yet. Safe to run twice.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS burial_date_text varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS burial_year      smallint,
  ADD COLUMN IF NOT EXISTS burial_month     smallint,
  ADD COLUMN IF NOT EXISTS burial_day       smallint;