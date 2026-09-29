# Run Luma on another Windows PC

You need **Docker for the API** and the **MSI app** on the same Windows machine.
(The translator UI/capture is a Windows app — only the API runs in Docker.)

## Quick path (Docker API + MSI)

### A. On the other PC — start API with Docker

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. Open PowerShell:

```powershell
# If pull is denied, either:
#   docker login ghcr.io
# or make the GitHub package "luma-api" public.

$env:GEMINI_API_KEY = 'YOUR_GEMINI_KEY'

# From a clone of this repo:
docker compose up
```

If you don’t have the repo on that PC, one-liner instead:

```powershell
docker run --rm -p 8080:8080 `
  -e BIND_ADDR=0.0.0.0:8080 `
  -e GEMINI_API_KEY=YOUR_GEMINI_KEY `
  -e ENABLE_LIVE_TOKEN_MINT=true `
  -e ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 `
  ghcr.io/sokmeankao/luma-api:0.0.1-ci.1
```

Leave that window open. API is at `http://127.0.0.1:8080`.

### B. Install the Windows app

1. Download `Luma-*-win-x64.msi` from https://github.com/SokmeanKao/Luma/releases  
2. Install → open **Luma** → choose window → Start  

Requires Windows 10/11 build **20348+** for Text + voice.

## Make image pull work without login

GitHub → Packages → **luma-api** → Package settings → Change visibility → **Public**.

## Helper script (from this repo)

```powershell
.\scripts\run-api-docker.ps1 -GeminiApiKey YOUR_KEY_HERE
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `denied` on docker pull | `docker login ghcr.io` or make package public |
| App can't translate | API container not running / bad `GEMINI_API_KEY` |
| Port 8080 busy | Stop other service, or change host port in compose to `8081:8080` (needs an MSI built for that port) |
| No Text + voice | OS too old, or source window isn't playing audio |
