ALTER TABLE pending_items ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE authorized_devices ADD COLUMN version integer NOT NULL DEFAULT 1;
