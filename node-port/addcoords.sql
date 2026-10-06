-- Coordinates for the places already recorded, so people can be put on a map.
--
-- The typed place names stay exactly as they are: they are historical
-- evidence ("Ziegenhain, Hesse-Nassau, Prussia"), and a modern geocoder
-- cannot always match them. These columns hold a position for drawing, and
-- are left empty where no sensible match exists.

ALTER TABLE people
  ADD COLUMN birth_lat  numeric(9,6),
  ADD COLUMN birth_lng  numeric(9,6),
  ADD COLUMN death_lat  numeric(9,6),
  ADD COLUMN death_lng  numeric(9,6),
  ADD COLUMN burial_lat numeric(9,6),
  ADD COLUMN burial_lng numeric(9,6);

ALTER TABLE marriages
  ADD COLUMN married_lat numeric(9,6),
  ADD COLUMN married_lng numeric(9,6);

-- somewhere to remember lookups, so the same place is never asked twice
CREATE TABLE IF NOT EXISTS place_lookups (
  query      text PRIMARY KEY,
  results    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);