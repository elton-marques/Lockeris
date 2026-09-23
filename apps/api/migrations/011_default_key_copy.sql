ALTER TABLE lockers ALTER COLUMN key_copy_available SET DEFAULT true;
UPDATE lockers SET key_copy_available=true,version=version+1 WHERE key_copy_available IS NULL;
ALTER TABLE lockers ALTER COLUMN key_copy_available SET NOT NULL;
