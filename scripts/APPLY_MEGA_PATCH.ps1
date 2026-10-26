param(
  [Parameter(Mandatory=$true)][string]$RepositoryPath,
  [switch]$AllowDirty
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path $RepositoryPath).Path
if (-not (Test-Path (Join-Path $repo '.git'))) { throw 'Target is not a Git repository.' }
$branch = (git -C $repo branch --show-current).Trim()
if ($branch -ne 'master') { throw "Refusing to apply on branch '$branch'. Checkout master first." }
$dirty = @(git -C $repo status --porcelain)
if ($dirty.Count -gt 0 -and -not $AllowDirty) { throw 'Working tree is dirty. Commit/stash local changes, or explicitly use -AllowDirty.' }
$backup = Join-Path (Split-Path $repo -Parent) ("tera-pre-v4-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$files = @('server.mjs','package.json','README.md','PROGRESS_V3_TO_V4.md','DEPLOYMENT_RUNBOOK.md','.env.example','.gitignore','.dockerignore','Dockerfile','docker-compose.yml','Caddyfile','vercel.json',
  'public/index.html','public/public.js','public/public.css','public/rules.js','public/favicon.svg','public/staff.html','public/staff.css','public/staff.js',
  'tests/smoke.mjs','tests/edge.mjs','tests/mega.mjs','tests/ui_isolated.py','tests/ui_v4_isolated.py','scripts/backup.mjs')
foreach($rel in $files){
  $in = Join-Path $source $rel; if (-not (Test-Path $in)) { throw "Missing source file: $rel" }
  $old = Join-Path $repo $rel
  if(Test-Path $old){$copy=Join-Path $backup $rel;New-Item -ItemType Directory -Path (Split-Path $copy -Parent) -Force|Out-Null;Copy-Item $old $copy -Force}
  New-Item -ItemType Directory -Path (Split-Path $old -Parent) -Force|Out-Null
  Copy-Item $in $old -Force
}
Write-Host "V4 overlay installed over master. Pre-existing files backed up: $backup" -ForegroundColor Green
Write-Host 'Next: npm test, review PROGRESS_V3_TO_V4.md and DEPLOYMENT_RUNBOOK.md, configure secrets outside Git.'
