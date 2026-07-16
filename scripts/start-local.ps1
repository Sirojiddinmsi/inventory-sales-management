$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$postgresRoot = Join-Path $root "tools\postgresql\pgsql"
$postgresBin = Join-Path $postgresRoot "bin"
$dataDir = Join-Path $root ".local\postgres-data"
$logsDir = Join-Path $root "logs"
$passwordFile = Join-Path $root ".local\postgres-password.txt"
$postgresLog = Join-Path $logsDir "postgres.log"
$apiLog = Join-Path $logsDir "api.log"
$apiErrorLog = Join-Path $logsDir "api-error.log"
$webLog = Join-Path $logsDir "web.log"
$webErrorLog = Join-Path $logsDir "web-error.log"

$env:PGPASSWORD = "inventory_password"
$env:PGCLIENTENCODING = "UTF8"
$env:PGOPTIONS = "-c client_min_messages=warning"

New-Item -ItemType Directory -Path (Split-Path $dataDir), $logsDir -Force | Out-Null

if (-not (Test-Path (Join-Path $postgresBin "postgres.exe"))) {
  throw "Portable PostgreSQL topilmadi: $postgresBin"
}

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  Set-Content -LiteralPath $passwordFile -Value "inventory_password" -NoNewline
  & (Join-Path $postgresBin "initdb.exe") `
    -D $dataDir `
    -U inventory `
    --pwfile=$passwordFile `
    --encoding=UTF8 `
    --locale=C

  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL cluster yaratilmadi."
  }

  Remove-Item -LiteralPath $passwordFile -Force
}

$postgresReady = & (Join-Path $postgresBin "pg_isready.exe") `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d postgres `
  2>$null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $postgresBin "pg_ctl.exe") `
    -D $dataDir `
    -l $postgresLog `
    -o "-h 127.0.0.1 -p 5432" `
    start

  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL ishga tushmadi. Log: $postgresLog"
  }
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  & (Join-Path $postgresBin "pg_isready.exe") `
    -h 127.0.0.1 `
    -p 5432 `
    -U inventory `
    -d postgres `
    *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 500
}

& (Join-Path $postgresBin "pg_isready.exe") `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d postgres `
  *> $null
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL tayyor holatga kelmadi."
}

$databaseExists = & (Join-Path $postgresBin "psql.exe") `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d postgres `
  -tAc "SELECT 1 FROM pg_database WHERE datname = 'inventory_sales'"

if ("$databaseExists".Trim() -ne "1") {
  & (Join-Path $postgresBin "createdb.exe") `
    -h 127.0.0.1 `
    -p 5432 `
    -U inventory `
    inventory_sales

  if ($LASTEXITCODE -ne 0) {
    throw "inventory_sales database yaratilmadi."
  }
}

$schemaExists = & (Join-Path $postgresBin "psql.exe") `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d inventory_sales `
  -tAc "SELECT to_regclass('public.users') IS NOT NULL"

if ("$schemaExists".Trim() -ne "t") {
  & (Join-Path $postgresBin "psql.exe") `
    -v ON_ERROR_STOP=1 `
    -h 127.0.0.1 `
    -p 5432 `
    -U inventory `
    -d inventory_sales `
    -f (Join-Path $root "database\migrations\001_initial_schema.sql")

  if ($LASTEXITCODE -ne 0) {
    throw "Database migration bajarilmadi."
  }

  & (Join-Path $postgresBin "psql.exe") `
    -v ON_ERROR_STOP=1 `
    -h 127.0.0.1 `
    -p 5432 `
    -U inventory `
    -d inventory_sales `
    -f (Join-Path $root "database\seeds\001_default_data.sql")

  if ($LASTEXITCODE -ne 0) {
    throw "Database seed bajarilmadi."
  }
}

& (Join-Path $postgresBin "psql.exe") `
  -v ON_ERROR_STOP=1 `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d inventory_sales `
  -c "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())" `
  *> $null

& (Join-Path $postgresBin "psql.exe") `
  -v ON_ERROR_STOP=1 `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d inventory_sales `
  -c "INSERT INTO schema_migrations (version) VALUES ('001_initial_schema') ON CONFLICT DO NOTHING" `
  *> $null

$migrationFiles = Get-ChildItem (Join-Path $root "database\migrations\*.sql") |
  Sort-Object Name

foreach ($migrationFile in $migrationFiles) {
  $version = [System.IO.Path]::GetFileNameWithoutExtension($migrationFile.Name)
  $migrationApplied = & (Join-Path $postgresBin "psql.exe") `
    -h 127.0.0.1 `
    -p 5432 `
    -U inventory `
    -d inventory_sales `
    -tAc "SELECT 1 FROM schema_migrations WHERE version = '$version'"

  if ("$migrationApplied".Trim() -ne "1") {
    & (Join-Path $postgresBin "psql.exe") `
      -v ON_ERROR_STOP=1 `
      -h 127.0.0.1 `
      -p 5432 `
      -U inventory `
      -d inventory_sales `
      -f $migrationFile.FullName

    if ($LASTEXITCODE -ne 0) {
      throw "Migration bajarilmadi: $($migrationFile.Name)"
    }

    & (Join-Path $postgresBin "psql.exe") `
      -v ON_ERROR_STOP=1 `
      -h 127.0.0.1 `
      -p 5432 `
      -U inventory `
      -d inventory_sales `
      -c "INSERT INTO schema_migrations (version) VALUES ('$version')" `
      *> $null
  }
}


$localUsersSql = @"
INSERT INTO users (name, email, password_hash, role, is_active)
VALUES
  ('Local Admin', 'local.admin@tikuv.test', crypt('LocalAdmin123!', gen_salt('bf', 12)), 'ADMIN', TRUE),
  ('Local Seller', 'local.seller@tikuv.test', crypt('LocalSeller123!', gen_salt('bf', 12)), 'SELLER', TRUE)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = TRUE,
    updated_at = NOW();

UPDATE users
SET is_active = FALSE,
    password_hash = crypt(gen_random_uuid()::text, gen_salt('bf', 12)),
    updated_at = NOW()
WHERE email = 'admin@example.com';
"@

& (Join-Path $postgresBin "psql.exe") `
  -v ON_ERROR_STOP=1 `
  -h 127.0.0.1 `
  -p 5432 `
  -U inventory `
  -d inventory_sales `
  -c $localUsersSql `
  *> $null

if ($LASTEXITCODE -ne 0) {
  throw "Lokal test foydalanuvchilari yaratilmadi."
}
Push-Location $root
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Loyiha build qilinmadi."
  }

  $apiListener = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
  if (-not $apiListener) {
    Start-Process `
      -FilePath "node.exe" `
      -ArgumentList "apps/api/dist/server.js" `
      -WorkingDirectory $root `
      -RedirectStandardOutput $apiLog `
      -RedirectStandardError $apiErrorLog `
      -WindowStyle Hidden
  }

  $apiReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:4000/health" -TimeoutSec 2
      if ($response.status -eq "ok") {
        $apiReady = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $apiReady) {
    throw "API ishga tushmadi. Loglar: $apiLog va $apiErrorLog"
  }

  $webListener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  if (-not $webListener) {
    Start-Process `
      -FilePath "cmd.exe" `
      -ArgumentList "/c", "npm.cmd --workspace @inventory/web run dev -- --host 127.0.0.1" `
      -WorkingDirectory $root `
      -RedirectStandardOutput $webLog `
      -RedirectStandardError $webErrorLog `
      -WindowStyle Hidden
  }

  $webReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:5173/login" -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $webReady = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $webReady) {
    throw "Frontend ishga tushmadi. Loglar: $webLog va $webErrorLog"
  }

  Write-Host ""
  Write-Host "Tikuv Market lokal ishga tushdi." -ForegroundColor Green
  Write-Host "Sayt:  http://127.0.0.1:5173"
  Write-Host "API:   http://127.0.0.1:4000"
  Write-Host "ADMIN:  local.admin@tikuv.test / LocalAdmin123!"
  Write-Host "SELLER: local.seller@tikuv.test / LocalSeller123!"

  Start-Process "http://127.0.0.1:5173"
} finally {
  Pop-Location
}
