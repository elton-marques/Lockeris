ALTER TABLE lockers ALTER COLUMN location_id DROP NOT NULL;
CREATE UNIQUE INDEX lockers_branch_number ON lockers(branch_id, number);
ALTER TABLE lockers ADD COLUMN sector_occupant text CHECK (sector_occupant IS NULL OR length(trim(sector_occupant)) > 0);
