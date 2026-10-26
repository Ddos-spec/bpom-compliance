param([Parameter(Mandatory=$true)][string]$RepoPath,[switch]$Force)
$ErrorActionPreference='Stop'
$packageRoot=Split-Path -Parent $PSScriptRoot
$target=(Resolve-Path -LiteralPath $RepoPath).Path
if (!(Test-Path (Join-Path $target '.git'))) { throw 'Target harus repository Git yang sudah ter-clone.' }
$branch=(& git -C $target branch --show-current).Trim()
if ($branch -ne 'master' -and !$Force) { throw "Branch aktif $branch. Checkout master atau gunakan -Force sesudah mereview." }
$expected='26a179fbb6a159076233d84d9ef46eea3b2ef06e'
$head=(& git -C $target rev-parse HEAD).Trim()
if ($head -ne $expected -and !$Force) { throw "HEAD sudah berubah ($head). Review diff & gunakan -Force jika sesuai." }
$items=@('server.mjs','package.json','.env.example','public/index.html','public/public.js','public/account.html','public/account.css','public/account.js','tests/account.mjs','tests/account_ui_isolated.py','README_V5.md','PROGRESS_V4_TO_V5.md')
$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$backup=Join-Path $target "backups/tera-v5-$timestamp"
foreach($item in $items){
  $src=Join-Path $packageRoot $item
  if (!(Test-Path -LiteralPath $src)) { throw "Patch tidak lengkap: $item" }
  $dst=Join-Path $target $item
  if(Test-Path -LiteralPath $dst){$b=Join-Path $backup $item;New-Item -ItemType Directory -Path (Split-Path -Parent $b) -Force | Out-Null;Copy-Item -LiteralPath $dst -Destination $b -Force}
}
foreach($item in $items){
  $src=Join-Path $packageRoot $item;$dst=Join-Path $target $item
  New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
Write-Host "TERA V5 applied. Backup: $backup"
Write-Host 'Review git diff, npm test, setup .env separately, and deploy to persistent VPS.'
