UPDATE pending_items p SET state='resolvida',resolution='Agrupada com matrícula não encontrada na base',updated_at=now(),version=p.version+1
FROM memberships m WHERE p.subject_type='membership' AND p.subject_id=m.id AND p.kind='atuacao_encerrada'
  AND p.state='aberta' AND m.category='colaborador' AND m.ti_present=false;
