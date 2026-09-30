-- Execute antes da reclassificação para conferir cada vínculo candidato.
SELECT m.id, p.name, b.name AS branch, m.category, m.registration, m.company,
       m.department, l.number AS locker_number, l.sector_occupant
FROM memberships m
JOIN people p ON p.id=m.person_id
JOIN branches b ON b.id=m.branch_id
LEFT JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
LEFT JOIN lockers l ON l.id=a.locker_id
WHERE m.category='terceirizado' AND NULLIF(trim(coalesce(m.registration,'')),'') IS NULL
  AND NULLIF(trim(coalesce(m.company,'')),'') IS NULL
  AND NULLIF(trim(coalesce(m.department,'')),'') IS NULL
  AND NULLIF(trim(coalesce(l.sector_occupant,'')),'') IS NULL
ORDER BY b.name,p.name;
