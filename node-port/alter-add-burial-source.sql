-- A source for the burial details, alongside birth_source and death_source.
-- Run this BEFORE deploying the code that uses it: saving a person writes the
-- column, and fails if it does not exist yet.
ALTER TABLE people ADD COLUMN IF NOT EXISTS burial_source text NOT NULL DEFAULT '';
