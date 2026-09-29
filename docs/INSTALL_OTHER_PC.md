# Run Luma on another Windows PC

You need the **desktop installer** and the **API** on the same machine (`http://127.0.0.1:8080`).

## 1. Install the app

1. Open the latest release: https://github.com/SokmeanKao/Luma/releases  
2. Download `Luma-*-win-x64.msi`  
3. Install and launch **Luma**

Requires Windows 10/11 (build **20348+** for Text + voice / per-app capture).

## 2. Start the API (Docker)

On that PC, with Docker Desktop running:

```powershell
# If the image is private, log in first (GitHub account with package read access):
# docker login ghcr.io

docker run --rm -p 8080:8080 `
  -e BIND_ADDR=0.0.0.0:8080 `
  -e GEMINI_API_KEY=YOUR_KEY_HERE `
  -e ENABLE_LIVE_TOKEN_MINT=true `
  -e ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 `
  ghcr.io/sokmeankao/luma-api:0.0.1-ci.1
```

Leave this terminal open while using Luma.

Or use the helper script from this repo:

```powershell
.\scripts\run-api-docker.ps1 -GeminiApiKey YOUR_KEY_HERE
```

## 3. Translate

1. Open Luma  
2. Pick languages and **Choose source** (app window with audio)  
3. Start  

## Make the image pullable without login

In GitHub → your profile → **Packages** → **luma-api** → **Package settings** → **Change visibility** → **Public**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| App opens but translation fails | API not running, or wrong `GEMINI_API_KEY` |
| `denied` pulling the image | `docker login ghcr.io`, or make the package public |
| Capture ends / no Text+voice | Windows build too old, or pick a window that is actually playing audio |
| Port 8080 in use | Stop the other process, or map `-p 8081:8080` and rebuild the desktop with `VITE_API_BASE=http://127.0.0.1:8081` (current MSI is fixed to `8080`) |
