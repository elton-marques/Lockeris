-- Exclusão definitiva de usuários: as referências passam a cair junto ou ficarem nulas,
-- preservando a trilha de auditoria e os registros operacionais criados pelo usuário.

ALTER TABLE allocations DROP CONSTRAINT allocations_started_by_fk;
ALTER TABLE allocations ADD CONSTRAINT allocations_started_by_fk FOREIGN KEY(started_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE allocations DROP CONSTRAINT allocations_ended_by_fk;
ALTER TABLE allocations ADD CONSTRAINT allocations_ended_by_fk FOREIGN KEY(ended_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sharings DROP CONSTRAINT sharings_ended_by_fk;
ALTER TABLE sharings ADD CONSTRAINT sharings_ended_by_fk FOREIGN KEY(ended_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sharings ALTER COLUMN authorized_by DROP NOT NULL;
ALTER TABLE sharings DROP CONSTRAINT sharings_authorized_by_fk;
ALTER TABLE sharings ADD CONSTRAINT sharings_authorized_by_fk FOREIGN KEY(authorized_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE events DROP CONSTRAINT events_actor_id_fkey;
ALTER TABLE events ADD CONSTRAINT events_actor_id_fkey FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE pending_items DROP CONSTRAINT pending_items_resolved_by_fkey;
ALTER TABLE pending_items ADD CONSTRAINT pending_items_resolved_by_fkey FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE operations DROP CONSTRAINT operations_actor_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_actor_id_fkey FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE imports ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE imports DROP CONSTRAINT imports_created_by_fkey;
ALTER TABLE imports ADD CONSTRAINT imports_created_by_fkey FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE need_exceptions ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE need_exceptions DROP CONSTRAINT need_exceptions_author_id_fkey;
ALTER TABLE need_exceptions ADD CONSTRAINT need_exceptions_author_id_fkey FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE authorized_devices ALTER COLUMN authorized_by DROP NOT NULL;
ALTER TABLE authorized_devices DROP CONSTRAINT authorized_devices_authorized_by_fkey;
ALTER TABLE authorized_devices ADD CONSTRAINT authorized_devices_authorized_by_fkey FOREIGN KEY(authorized_by) REFERENCES users(id) ON DELETE SET NULL;
