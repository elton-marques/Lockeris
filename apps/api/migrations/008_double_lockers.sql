ALTER TABLE lockers ADD COLUMN is_double boolean NOT NULL DEFAULT false;
ALTER TABLE lockers ADD CONSTRAINT lockers_double_capacity CHECK (NOT is_double OR capacity >= 2);
