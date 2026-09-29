CREATE TABLE retained_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  locker_id uuid NOT NULL REFERENCES lockers(id),
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (length(trim(description)) > 0),
  status text NOT NULL DEFAULT 'retido' CHECK (status IN ('retido','devolvido','destinado')),
  retained_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  resolved_at timestamptz,
  notes text,
  CHECK ((status = 'retido' AND resolved_at IS NULL) OR (status <> 'retido' AND resolved_at IS NOT NULL))
);
CREATE INDEX retained_items_branch_status_expiry ON retained_items(branch_id,status,expires_at);

CREATE TABLE audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  auditor_name text NOT NULL CHECK (length(trim(auditor_name)) > 0),
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluida')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  summary_notes text,
  total_lockers integer NOT NULL CHECK (total_lockers >= 0),
  CHECK ((status = 'em_andamento' AND completed_at IS NULL) OR (status = 'concluida' AND completed_at IS NOT NULL))
);
CREATE INDEX audits_branch_started ON audits(branch_id,started_at DESC);
CREATE TABLE audit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  locker_id uuid NOT NULL REFERENCES lockers(id),
  issue_type text NOT NULL CHECK (issue_type IN ('cadeado_fora_padrao','sem_cadeado','itens_fora_armario','mecanismo_avariado','outro')),
  notes text,
  UNIQUE (audit_id,locker_id,issue_type)
);
