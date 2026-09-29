ALTER TABLE retained_items ALTER COLUMN locker_id DROP NOT NULL;
ALTER TABLE retained_items ADD COLUMN category text;
ALTER TABLE retained_items ADD COLUMN custom_category text;
ALTER TABLE retained_items ADD COLUMN found_at timestamptz;
ALTER TABLE retained_items ADD COLUMN finder_id uuid REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE retained_items ADD COLUMN finder_name text;
ALTER TABLE retained_items ADD COLUMN found_location text;
ALTER TABLE retained_items ADD COLUMN storage_location text;
UPDATE retained_items r SET category='outro',custom_category='Pertence registrado anteriormente',found_at=retained_at,
  finder_name='Não informado',found_location='Armário '||l.number,storage_location='Não informado'
  FROM lockers l WHERE l.id=r.locker_id;
ALTER TABLE retained_items ALTER COLUMN category SET NOT NULL;
ALTER TABLE retained_items ALTER COLUMN category SET DEFAULT 'outro';
ALTER TABLE retained_items ALTER COLUMN found_at SET NOT NULL;
ALTER TABLE retained_items ALTER COLUMN found_at SET DEFAULT now();
ALTER TABLE retained_items ALTER COLUMN finder_name SET NOT NULL;
ALTER TABLE retained_items ALTER COLUMN found_location SET NOT NULL;
ALTER TABLE retained_items ALTER COLUMN storage_location SET NOT NULL;
ALTER TABLE retained_items ADD CONSTRAINT retained_items_category CHECK (category IN ('roupa','calcado','celular','relogio','oculos','outro'));
ALTER TABLE retained_items ADD CONSTRAINT retained_items_custom_category CHECK (category <> 'outro' OR length(trim(coalesce(custom_category,''))) > 0);
ALTER TABLE retained_items ADD CONSTRAINT retained_items_places CHECK (length(trim(finder_name)) > 0 AND length(trim(found_location)) > 0 AND length(trim(storage_location)) > 0);
ALTER TABLE retained_items ADD CONSTRAINT retained_items_expiry CHECK (expires_at = found_at + interval '30 days');
ALTER TABLE audits ADD COLUMN auditor_id uuid REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE audit_records ADD COLUMN occupants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE audit_records ADD COLUMN sector_occupant text;
