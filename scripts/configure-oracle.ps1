$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')
Initialize-AllianceRuntime
function Read-AlliancePassword([string]$Prompt) {
    $taskSecureValue = Read-Host $Prompt -AsSecureString
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer); $taskSecureValue.Dispose() }
}
Write-Host 'Oracle: configuracion local del servidor. No pegues contrasenas en el chat.'
Write-Host 'En Oracle Cloud abre tu base -> Database Connection (Conexion de base de datos).'
Write-Host '1: TLS, copiar la cadena de conexion. 2: Wallet, si tu base requiere ese archivo.'
$taskMode = Read-Host 'Elige 1 o 2 [1]'
if (-not $taskMode) { $taskMode = '1' }
if ($taskMode -notin @('1','2')) { throw 'Elige 1 para TLS o 2 para wallet.' }
# Reuse the connection already saved in .env without exposing it in terminal output.
$taskEnvPath = Join-Path ((Get-Location).Path) '.env'
$taskSavedText = if (Test-Path -LiteralPath $taskEnvPath) { Get-Content -LiteralPath $taskEnvPath -Raw } else { '' }
$taskSavedConnection = [regex]::Match($taskSavedText, '(?m)^ORACLE_CONNECT_STRING=[\x27\x22]?(\(description=.*?\))[\x27\x22]?\r?$').Groups[1].Value
$taskSavedText = $null
$taskUser = Read-Host 'Usuario del esquema donde ejecutaste 001-007 [ADMIN]'
if (-not $taskUser) { $taskUser = 'ADMIN' }
$taskInput = @{ ORACLE_USER=$taskUser; ORACLE_PASSWORD=(Read-AlliancePassword 'Contrasena de ese usuario Oracle'); ORACLE_CONNECTION_MODE='TLS'; ORACLE_CONFIG_DIR=''; ORACLE_WALLET_LOCATION=''; ORACLE_WALLET_PASSWORD='' }
if ($taskMode -eq '2') {
    $taskWallet = (Read-Host 'Ruta de la carpeta donde descomprimiste el wallet').Trim('"')
    $taskWallet = (Resolve-Path -LiteralPath $taskWallet).Path
    if (-not (Test-Path -LiteralPath (Join-Path $taskWallet 'ewallet.pem')) -or -not (Test-Path -LiteralPath (Join-Path $taskWallet 'tnsnames.ora'))) { throw 'Descomprime el wallet: la carpeta debe contener ewallet.pem y tnsnames.ora.' }
    $taskInput.ORACLE_CONNECTION_MODE='MTLS'; $taskInput.ORACLE_CONFIG_DIR=$taskWallet; $taskInput.ORACLE_WALLET_LOCATION=$taskWallet
    $taskInput.ORACLE_WALLET_PASSWORD = Read-AlliancePassword 'Contrasena elegida al descargar el wallet'
    Write-Host 'Usa un alias de tnsnames.ora, por ejemplo el que termina en _tp o _low.'
    $taskInput.ORACLE_CONNECT_STRING = Read-Host 'Alias de conexion'
} else {
    if ($taskSavedConnection) { Write-Host 'Ya existe una cadena TLS guardada. Enter la conserva.' }
    $taskConnection = Read-Host 'Pega la cadena TLS completa, o pulsa Enter para usar la guardada (si falta, se lee del portapapeles)'
    if (-not $taskConnection) { $taskConnection = if ($taskSavedConnection) { $taskSavedConnection } else { Get-Clipboard -Raw } }
    $taskInput.ORACLE_CONNECT_STRING = ($taskConnection -replace '[\r\n]+',' ').Trim()
}
if (-not $taskInput.ORACLE_PASSWORD -or -not $taskInput.ORACLE_CONNECT_STRING) { throw 'Completa la contrasena y la cadena de conexion.' }
try {
    $taskJson = ConvertTo-Json -InputObject $taskInput -Compress
    $taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskJson))
    $taskEncoded | & node.exe node_modules/tsx/dist/cli.mjs scripts/configure-env.ts
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo guardar la configuracion.' }
} finally { $taskInput.Clear(); $taskJson=$null; $taskEncoded=$null }
