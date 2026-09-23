ALTER TABLE users ADD COLUMN username text;
WITH names AS (
  SELECT id,
    left(lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]', '_', 'g')), 64) AS base,
    row_number() OVER (PARTITION BY left(lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9._-]', '_', 'g')), 64) ORDER BY id) AS ordinal
  FROM users
)
UPDATE users SET username=CASE WHEN names.ordinal=1 THEN names.base ELSE names.base || '-' || names.ordinal END
FROM names WHERE users.id=names.id;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX users_username_unique_ci ON users(lower(username));
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
