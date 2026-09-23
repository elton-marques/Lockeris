param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$DatabaseName = 'armarios_restore_test'
)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
if (-not $resolved.ToLowerInvariant().EndsWith('.dump')) { throw 'Informe um arquivo .dump' }
if ($DatabaseName -notmatch '^[a-z][a-z0-9_]*$' -or $DatabaseName -eq 'armarios') { throw 'Use um banco de restauração separado' }
docker compose exec -T db psql -U armarios -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DatabaseName;"
$dbContainer = (docker compose ps -q db).Trim()
if (-not $dbContainer) { throw 'Banco Docker não está em execução' }
docker cp $resolved "${dbContainer}:/tmp/armarios-restore.dump"
try {
  docker compose exec -T db pg_restore -U armarios -d $DatabaseName --no-owner --no-privileges /tmp/armarios-restore.dump
} finally {
  docker compose exec -T db rm -f /tmp/armarios-restore.dump
}
docker compose exec -T db psql -U armarios -d $DatabaseName -At -c 'SELECT (SELECT count(*) FROM branches), (SELECT count(*) FROM lockers), (SELECT count(*) FROM allocations), (SELECT count(*) FROM imports), (SELECT count(*) FROM events);'
