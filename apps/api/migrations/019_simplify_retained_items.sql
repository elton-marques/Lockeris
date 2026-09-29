ALTER TABLE retained_items DROP CONSTRAINT retained_items_places;
ALTER TABLE retained_items DROP COLUMN storage_location;
ALTER TABLE retained_items ADD CONSTRAINT retained_items_places CHECK (length(trim(finder_name)) > 0 AND length(trim(found_location)) > 0);
