CREATE TABLE key_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  locker_id uuid NOT NULL REFERENCES lockers(id),
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  person_name text NOT NULL CHECK (length(trim(person_name)) > 0),
  person_registration text,
  notes text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  taken_by uuid REFERENCES users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  returned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CHECK (returned_at IS NULL OR returned_at >= taken_at)
);
CREATE UNIQUE INDEX key_loans_open_per_locker ON key_loans(locker_id) WHERE returned_at IS NULL;
CREATE INDEX key_loans_branch_taken ON key_loans(branch_id, taken_at DESC);
