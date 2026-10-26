$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
Initialize-AllianceRuntime
& node.exe node_modules/tsx/dist/cli.mjs scripts/configure-env.ts --status
if ($LASTEXITCODE -ne 0) { & (Join-Path $PSScriptRoot 'configure-oracle.ps1') }
Write-Host 'Comprobando conexion y esquema Oracle...'
& npm.cmd run db:check
if ($LASTEXITCODE -ne 0) { throw 'Oracle no paso la comprobacion. Revisa el mensaje antes de continuar.' }
if (Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue) { throw 'El puerto 3001 ya esta ocupado. Si Alliance ya esta iniciado, abre index.html con Live Server.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el frontend.' }
Write-Host 'Abre index.html con Live Server -> Centro operativo. Esta terminal ejecuta solo la API local; Ctrl+C la detiene.'
& npm.cmd run api:oracle
