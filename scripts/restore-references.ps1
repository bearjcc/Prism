# Restore gitignored clones from references.lock.json (npm ci analogue).
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LockPath = Join-Path $RepoRoot 'references.lock.json'
$ReferencesRoot = Join-Path $RepoRoot 'References'

if (-not (Test-Path $LockPath)) {
    throw "Missing lockfile: $LockPath"
}

$lock = Get-Content -Raw -Path $LockPath | ConvertFrom-Json
if ($null -eq $lock.version) {
    throw 'references.lock.json must have version'
}

New-Item -ItemType Directory -Force -Path $ReferencesRoot | Out-Null

$entries = @($lock.references)
if ($entries.Count -eq 0 -or ($entries.Count -eq 1 -and $null -eq $entries[0])) {
    Write-Host 'No references in lockfile.'
    exit 0
}

foreach ($entry in $entries) {
    foreach ($required in @('id', 'url', 'ref', 'sha', 'dest')) {
        if (-not $entry.$required) {
            throw "Reference '$($entry.id)' missing $required"
        }
    }

    $dest = Join-Path $ReferencesRoot $entry.dest
    $sha = [string]$entry.sha

    if (Test-Path (Join-Path $dest '.git')) {
        git -C $dest fetch --tags
        git -C $dest fetch $entry.url $entry.ref
    }
    else {
        git clone $entry.url $dest
    }

    git -C $dest checkout --detach $sha
    $head = (git -C $dest rev-parse HEAD).Trim()
    if ($head -ne $sha) {
        throw "SHA mismatch for $($entry.id): expected $sha, got $head"
    }

    Write-Host "OK $($entry.id) -> $dest ($sha)"
}
