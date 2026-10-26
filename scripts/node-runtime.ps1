function Initialize-AllianceRuntime {
    $taskProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        $taskPortableNode = Get-ChildItem -LiteralPath (Join-Path $taskProjectRoot '../.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
        if (-not $taskPortableNode) { throw 'Instala Node.js 22.12 o superior para ejecutar el proyecto.' }
        $env:Path = $taskPortableNode.FullName + ';' + $env:Path
    }
    Set-Location -LiteralPath $taskProjectRoot
    if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' } }
}
