$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $project 'backend'
$frontend = Join-Path $project 'frontend'

if (-not (Test-Path (Join-Path $frontend 'node_modules\vite'))) {
    throw 'Frontend packages are not installed. Open a terminal in frontend and run: npm install'
}

$python = Get-Command python -ErrorAction Stop
$pythonPath = $python.Source
$venvPython = Join-Path $backend 'env\Scripts\python.exe'
if (Test-Path $venvPython) {
    $venvDeps = & $venvPython -c 'import fastapi, uvicorn, chromadb, transformers, dotenv' 2>&1
    if ($LASTEXITCODE -eq 0) { $pythonPath = $venvPython }
}
$deps = & $pythonPath -c 'import fastapi, uvicorn, chromadb, transformers, dotenv' 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Backend packages are missing. Follow the Backend setup in README.md. Details: $deps"
}

$npm = Get-Command npm.cmd -ErrorAction Stop
$logs = Join-Path $backend 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'backend.log') -RedirectStandardError (Join-Path $logs 'backend-error.log')
Start-Process -FilePath $npm.Source -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1') -WorkingDirectory $frontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'frontend.log') -RedirectStandardError (Join-Path $logs 'frontend-error.log')
Start-Sleep -Seconds 2
Start-Process 'http://127.0.0.1:5173'
Write-Host 'R-instat Knowlegde is starting at http://127.0.0.1:5173'
Write-Host "Logs: $logs"
