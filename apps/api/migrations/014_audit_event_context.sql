ALTER TABLE events ADD COLUMN IF NOT EXISTS locker_number text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS person_name text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS person_registration text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sector_name text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
CREATE INDEX IF NOT EXISTS events_branch_locker ON events(branch_id, locker_number) WHERE locker_number IS NOT NULL;
