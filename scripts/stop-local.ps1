$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$postgresBin = Join-Path $root "tools\postgresql\pgsql\bin"
$dataDir = Join-Path $root ".local\postgres-data"

foreach ($port in 4000, 5173) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

if (Test-Path (Join-Path $dataDir "postmaster.pid")) {
  & (Join-Path $postgresBin "pg_ctl.exe") -D $dataDir stop -m fast
}

Write-Host "Lokal servislar to'xtatildi." -ForegroundColor Green

