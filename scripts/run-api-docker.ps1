#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$GeminiApiKey,

  [string]$Image = 'ghcr.io/sokmeankao/luma-api:0.0.1-ci.1',

  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

Write-Host "Pulling $Image ..."
docker pull $Image

Write-Host "Starting API on http://127.0.0.1:$Port (Ctrl+C to stop)"
docker run --rm -p "${Port}:8080" `
  -e BIND_ADDR=0.0.0.0:8080 `
  -e "GEMINI_API_KEY=$GeminiApiKey" `
  -e ENABLE_LIVE_TOKEN_MINT=true `
  -e ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 `
  $Image
