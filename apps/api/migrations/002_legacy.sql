CREATE TABLE legacy_history (
  id bigserial PRIMARY KEY, import_id uuid NOT NULL REFERENCES imports,
  sheet_name text NOT NULL, row_number integer NOT NULL, raw jsonb NOT NULL
);
CREATE INDEX legacy_history_import ON legacy_history(import_id);
