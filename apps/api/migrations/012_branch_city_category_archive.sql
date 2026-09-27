ALTER TABLE branches ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_status_check') THEN
    ALTER TABLE branches ADD CONSTRAINT branches_status_check CHECK (status IN ('active','inactive'));
  END IF;
END $$;
DO $$ DECLARE old_name text; BEGIN
  SELECT conname INTO old_name FROM pg_constraint
    WHERE conrelid='memberships'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%category%';
  IF old_name IS NOT NULL THEN EXECUTE format('ALTER TABLE memberships DROP CONSTRAINT %I', old_name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='memberships_category_check') THEN
    ALTER TABLE memberships ADD CONSTRAINT memberships_category_check
      CHECK (category IN ('colaborador','promotor_fixo','roteirista','terceirizado','vinculo_nao_identificado'));
  END IF;
END $$;
UPDATE memberships m SET category='vinculo_nao_identificado',version=version+1,updated_at=now()
WHERE m.category='terceirizado'
  AND NULLIF(trim(coalesce(m.registration,'')),'') IS NULL
  AND NULLIF(trim(coalesce(m.company,'')),'') IS NULL
  AND NULLIF(trim(coalesce(m.department,'')),'') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM allocations a JOIN lockers l ON l.id=a.locker_id
    WHERE a.person_id=m.person_id AND a.ended_at IS NULL
      AND NULLIF(trim(coalesce(l.sector_occupant,'')),'') IS NOT NULL
  );
