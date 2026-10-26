param([switch]$Development)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    $taskPortableNode = Get-ChildItem -LiteralPath (Join-Path $taskProjectRoot '../.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $taskPortableNode) { throw 'Instala Node.js 22 LTS o superior para ejecutar el proyecto.' }
    $env:Path = $taskPortableNode.FullName + ';' + $env:Path
}
Set-Location -LiteralPath $taskProjectRoot
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
if ($Development) {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Copia .env.example a .env y configura el proveedor y los secretos.' }
    & npm.cmd run dev
} else {
    if (-not (Test-Path -LiteralPath 'dist/admin/index.html')) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
    Write-Host 'Abre http://127.0.0.1:4173/index.html -> Centro operativo -> Abrir demostracion local'
    & npm.cmd run preview
}
