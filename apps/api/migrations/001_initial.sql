CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, timezone text NOT NULL DEFAULT 'America/Fortaleza',
  ti_revision bigint NOT NULL DEFAULT 0, ti_extracted_on date, version integer NOT NULL DEFAULT 1
);
CREATE TABLE locations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches, name text NOT NULL, UNIQUE(branch_id,name));
CREATE TABLE people (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES people, branch_id uuid NOT NULL REFERENCES branches,
  category text NOT NULL CHECK (category IN ('colaborador','promotor_fixo','roteirista','terceirizado')),
  origin text NOT NULL CHECK (origin IN ('manual','ti','migracao')),
  registration text, company text, department text, function_name text,
  status text NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','encerrado')),
  needs_fixed boolean NOT NULL DEFAULT false, ti_present boolean, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(person_id,branch_id), CHECK (registration IS NULL OR length(trim(registration)) > 0)
);
CREATE UNIQUE INDEX memberships_registration_branch ON memberships(branch_id,registration) WHERE registration IS NOT NULL;
CREATE TABLE lockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches, location_id uuid NOT NULL REFERENCES locations,
  number text NOT NULL, size text NOT NULL CHECK(size IN ('padrao','grande')),
  capacity integer NOT NULL CHECK(capacity > 0), modality text NOT NULL CHECK(modality IN ('fixo','rotativo')),
  destination text, condition text NOT NULL DEFAULT 'disponivel' CHECK(condition IN ('disponivel','manutencao','bloqueado')),
  migration_status text NOT NULL DEFAULT 'conferido' CHECK(migration_status IN ('conferido','inconclusivo')),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(location_id,number)
);
CREATE TABLE allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches,
  locker_id uuid NOT NULL REFERENCES lockers, person_id uuid NOT NULL REFERENCES people,
  modality text NOT NULL CHECK(modality IN ('fixo','rotativo')), seasonal boolean NOT NULL DEFAULT false,
  started_at timestamptz, original_start_unknown boolean NOT NULL DEFAULT false,
  migrated_at timestamptz, ended_at timestamptz, due_at timestamptz,
  reason text, note text, started_by uuid, ended_by uuid, version integer NOT NULL DEFAULT 1,
  CHECK(NOT seasonal OR due_at IS NOT NULL), CHECK(started_at IS NOT NULL OR original_start_unknown)
);
CREATE UNIQUE INDEX allocations_one_active_per_person ON allocations(person_id) WHERE ended_at IS NULL;
CREATE INDEX allocations_active_locker ON allocations(locker_id) WHERE ended_at IS NULL;
CREATE TABLE sharings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), locker_id uuid NOT NULL REFERENCES lockers,
  reason text NOT NULL, due_at timestamptz NOT NULL, authorized_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, ended_by uuid, version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX sharings_one_active_per_locker ON sharings(locker_id) WHERE ended_at IS NULL;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('geral','filial_admin','operador','consulta')),
  branch_id uuid REFERENCES branches, must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE allocations ADD CONSTRAINT allocations_started_by_fk FOREIGN KEY(started_by) REFERENCES users(id);
ALTER TABLE allocations ADD CONSTRAINT allocations_ended_by_fk FOREIGN KEY(ended_by) REFERENCES users(id);
ALTER TABLE sharings ADD CONSTRAINT sharings_authorized_by_fk FOREIGN KEY(authorized_by) REFERENCES users(id);
ALTER TABLE sharings ADD CONSTRAINT sharings_ended_by_fk FOREIGN KEY(ended_by) REFERENCES users(id);
CREATE TABLE sessions (id_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE authorized_devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches, label text NOT NULL, secret_hash text NOT NULL UNIQUE, authorized_by uuid NOT NULL REFERENCES users, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE operations (id uuid PRIMARY KEY, branch_id uuid REFERENCES branches, actor_id uuid NOT NULL REFERENCES users, payload_hash text NOT NULL, result jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE events (id bigserial PRIMARY KEY, branch_id uuid NOT NULL REFERENCES branches, actor_id uuid REFERENCES users, kind text NOT NULL, entity_type text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT '{}', happened_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX events_branch_time ON events(branch_id,happened_at DESC);
CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches, kind text NOT NULL CHECK(kind IN ('ti','migracao')),
  extracted_on date, file_hash text NOT NULL, filename text NOT NULL, sheet_name text, base_revision bigint NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','applied','rejected')),
  mapping jsonb NOT NULL, preview jsonb NOT NULL, raw_rows jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
);
CREATE UNIQUE INDEX imports_applied_hash ON imports(branch_id,kind,file_hash) WHERE state='applied';
CREATE TABLE import_sources (id bigserial PRIMARY KEY, import_id uuid NOT NULL REFERENCES imports, sheet_name text NOT NULL, row_number integer NOT NULL, entity_type text, entity_id uuid, raw jsonb NOT NULL);
CREATE TABLE pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches, kind text NOT NULL,
  subject_type text NOT NULL, subject_id uuid NOT NULL, state text NOT NULL DEFAULT 'aberta' CHECK(state IN ('aberta','resolvida')),
  reason text, resolution text, resolved_by uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id,kind,subject_type,subject_id)
);
CREATE TABLE need_exceptions (membership_id uuid PRIMARY KEY REFERENCES memberships, reason text NOT NULL, author_id uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now());
