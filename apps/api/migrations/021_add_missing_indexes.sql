CREATE INDEX IF NOT EXISTS import_sources_entity_idx ON import_sources(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch_id);
CREATE INDEX IF NOT EXISTS memberships_branch_idx ON memberships(branch_id);
