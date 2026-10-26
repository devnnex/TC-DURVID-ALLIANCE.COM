$ErrorActionPreference = 'Stop'
$taskEnvPath = Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))) '.env'
if (-not (Test-Path -LiteralPath $taskEnvPath)) { throw 'Primero ejecuta scripts/start-oracle.ps1 para preparar la configuracion.' }
$taskMatch = [regex]::Match([IO.File]::ReadAllText($taskEnvPath), '(?m)^SETUP_TOKEN=([^\r\n]+)')
if (-not $taskMatch.Success) { throw 'No se encontro el token de instalacion en .env.' }
$taskSetupToken = $taskMatch.Groups[1].Value.Trim().Trim('"').Trim("'").Trim('`')
if ($taskSetupToken.Length -lt 32) { throw 'El token de instalacion debe tener al menos 32 caracteres.' }
Set-Clipboard -Value $taskSetupToken
$taskSetupToken = $null
Write-Host 'Token copiado al portapapeles. Pegalo en Token de instalacion del formulario inicial.'
