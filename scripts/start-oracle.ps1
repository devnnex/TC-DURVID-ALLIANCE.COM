$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
Initialize-AllianceRuntime
& node.exe node_modules/tsx/dist/cli.mjs scripts/configure-env.ts --status
if ($LASTEXITCODE -ne 0) { & (Join-Path $PSScriptRoot 'configure-oracle.ps1') }
Write-Host 'Comprobando conexion, tablas y permisos de Oracle...'
& npm.cmd run db:check
if ($LASTEXITCODE -ne 0) { throw 'La comprobacion no paso. Corrige el dato indicado y ejecuta scripts/configure-oracle.ps1 para cambiar la conexion.' }
foreach ($taskPort in @(3001,4173)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) { throw "El puerto $taskPort ya esta ocupado. Cierra la instancia anterior de Alliance antes de iniciar otra." }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'La compilacion no paso; revisa el error antes de continuar.' }
Write-Host 'Abre http://127.0.0.1:4173/admin/ para probar el sistema con Oracle. Ctrl+C detiene ambos servidores.'
& npm.cmd run stage
