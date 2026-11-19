# Startet die V3 auf http://localhost:5176 (kein Build nötig, nur ein kleiner Webserver)
Set-Location $PSScriptRoot
Start-Process "http://localhost:5176"
python -m http.server 5176 --bind 127.0.0.1
