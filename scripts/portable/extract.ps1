$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:LOCKERIS_ZIP)
$targetRoot = [System.IO.Path]::GetFullPath($env:LOCKERIS_EXTRACT)
$targetPrefix = $targetRoot.TrimEnd('\') + '\'
try {
    foreach ($entry in $archive.Entries) {
        $entryName = $entry.FullName.Replace('\', '/')
        if ($env:LOCKERIS_ZIP_KIND -eq 'msvc' -and $entryName -notmatch '^(concrt140|msvcp140[^/]*|vcruntime140[^/]*|vcomp140)\.dll$|^AppxManifest\.xml$') {
            continue
        }
        if ($env:LOCKERIS_ZIP_KIND -eq 'postgres' -and $entryName -notmatch '^pgsql/(bin/|lib/|share/|[^/]*(?i:license|copying|copyright)[^/]*$)') {
            continue
        }
        $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($targetRoot, $entryName))
        if (-not $target.StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'O ZIP contém um caminho fora do diretório de extração.'
        }
        if ($entryName.EndsWith('/')) {
            [System.IO.Directory]::CreateDirectory($target) | Out-Null
        } else {
            [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
        }
    }
} finally {
    $archive.Dispose()
}
