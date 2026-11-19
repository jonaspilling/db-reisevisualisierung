# Startet das Redesign (Bordbistro v2) auf http://localhost:5174, parallel zur alten Seite auf 5173.
Set-Location $PSScriptRoot
if (-not (Test-Path node_modules)) { npm install }
Start-Process "http://localhost:5174"
npm run dev
