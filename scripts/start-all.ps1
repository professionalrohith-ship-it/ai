# Opens the backend and the frontend in two PowerShell windows, then opens the app in your browser.
$here = $PSScriptRoot
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "$here\start-backend.ps1"
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "$here\start-frontend.ps1"
Start-Sleep -Seconds 6
Start-Process 'http://localhost:5173'
