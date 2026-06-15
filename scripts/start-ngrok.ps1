param(
  [string]$Authtoken,
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $root "tools\ngrok"
$ngrokExe = Join-Path $toolsDir "ngrok.exe"
$logsDir = Join-Path $root "logs"
$stdoutLog = Join-Path $logsDir "ngrok.log"
$stderrLog = Join-Path $logsDir "ngrok-error.log"
$configDir = Join-Path $env:LOCALAPPDATA "ngrok"
$configPath = Join-Path $configDir "ngrok.yml"

New-Item -ItemType Directory -Path $toolsDir, $logsDir -Force | Out-Null

if (-not (Test-Path $ngrokExe)) {
  $zipPath = Join-Path $toolsDir "ngrok.zip"
  Invoke-WebRequest -UseBasicParsing `
    -Uri "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip" `
    -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $toolsDir -Force
}

if ($Authtoken) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
  & $ngrokExe config add-authtoken $Authtoken
  if ($LASTEXITCODE -ne 0) {
    throw "Ngrok authtoken saqlanmadi."
  }
}

if (-not (Test-Path $configPath)) {
  throw "Ngrok token topilmadi. Bir marta ishga tushiring: START-NGROK.cmd <YOUR_NGROK_TOKEN>"
}

try {
  $check = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port" -TimeoutSec 2
  if ($check.StatusCode -lt 200 -or $check.StatusCode -ge 500) {
    throw "Port javobi kutilgan emas."
  }
} catch {
  throw "Lokal sayt ochiq emas: http://127.0.0.1:$Port"
}

Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $stdoutLog, $stderrLog -ErrorAction SilentlyContinue

Start-Process `
  -FilePath $ngrokExe `
  -ArgumentList "http $Port --log stdout" `
  -WorkingDirectory $toolsDir `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden

$publicUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
    $publicUrl = $tunnels.tunnels |
      Where-Object { $_.proto -eq "https" } |
      Select-Object -First 1 -ExpandProperty public_url
    if ($publicUrl) {
      break
    }
  } catch {
  }
}

if (-not $publicUrl) {
  $logTail = ""
  if (Test-Path $stderrLog) {
    $logTail = (Get-Content $stderrLog -Tail 20) -join [Environment]::NewLine
  } elseif (Test-Path $stdoutLog) {
    $logTail = (Get-Content $stdoutLog -Tail 20) -join [Environment]::NewLine
  }
  throw "Ngrok tunnel ochilmadi.`n$logTail"
}

Write-Host ""
Write-Host "Ngrok tunnel tayyor." -ForegroundColor Green
Write-Host "Local:  http://127.0.0.1:$Port"
Write-Host "Global: $publicUrl"

Start-Process $publicUrl
