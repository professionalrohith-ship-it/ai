# Starts the CODEMIND frontend on http://localhost:5173.
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\agent_pro"
npm run dev
