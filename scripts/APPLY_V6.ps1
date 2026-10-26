param(
 [Parameter(Mandatory=$true)][string]$RepoPath,
 [switch]$AllowNewerCommit
)
$ErrorActionPreference = 'Stop'
$patchRoot = Split-Path -Parent $PSScriptRoot
$repo = (Resolve-Path $RepoPath).Path
if (-not (Test-Path (Join-Path $repo '.git'))) { throw 'RepoPath bukan working tree Git (folder .git tidak ditemukan).' }
$branch = (git -C $repo branch --show-current).Trim()
$sha = (git -C $repo rev-parse HEAD).Trim()
$expected='5a8620eb0bdb69d08447c4a2736025f8c4873169'
if($branch -ne 'master'){throw "Branch saat ini '$branch', harapkan master."}
if($sha -ne $expected -and -not $AllowNewerCommit){throw "Basis SHA berbeda ($sha). Backup/review diff, baru ulangi dengan -AllowNewerCommit jika yakin."}
$paths=@('server.mjs','package.json','public/account.js','public/account.html','public/account.css','public/staff.js','public/staff.html','public/staff.css','public/demo.html','tests/v6.mjs','tests/v6_preview.mjs','tests/v6_ui_isolated.py','README_V6.md','release/QA_REPORT_V6.md','release/AI_DEVOPS_HANDOFF.md','release/AI_IMPLEMENTER_PROMPT.md','release/PROGRESS_V5_TO_V6.md')
$backup = Join-Path $repo ('.tera-v6-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach($relative in $paths){
  $from=Join-Path $patchRoot $relative
  $to=Join-Path $repo $relative
  if(-not (Test-Path $from)){throw "Patch tidak lengkap: $relative"}
  New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force | Out-Null
  if(Test-Path $to){$save=Join-Path $backup $relative;New-Item -ItemType Directory -Path (Split-Path $save -Parent) -Force | Out-Null;Copy-Item $to $save -Force}
  Copy-Item $from $to -Force
}
Write-Host "Patch V6 selesai di-overlay. Backup: $backup"
Write-Host 'Tidak mengubah .env, data/, Docker, DNS, Midtrans key, deployment, atau remote GitHub.'
Write-Host 'Jalankan: npm test ; python tests/account_ui_isolated.py ; python tests/ui_v4_isolated.py'
Write-Host 'Poin VPS: release/AI_DEVOPS_HANDOFF.md (owner/AI developer)'
