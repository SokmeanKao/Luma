# Luma

Personal live audio translation companion (Korean → English initially). Web MVP with explicit **demo mode**, shared packages, and a Go token-service stub.

This repository still includes the handoff docs and HTML mockup under `docs/` and `design/`.

## Workspace layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js App Router UI |
| `packages/ui` | Shared React controls and styles |
| `packages/translation` | Session state, mock provider, transcript assembly |
| `packages/audio` | Capture/encoder interfaces (no microphone) |
| `services/api` | Go health / capabilities / live-token stub |
| `docs/feasibility/STATUS.md` | Per-gate feasibility status |

## Development (PowerShell)

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
pnpm install
pnpm dev
```

Go API (separate terminal):

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation\services\api
go test ./...
go run ./cmd/server
```

Demo mode is the default (`NEXT_PUBLIC_LUMA_MODE=demo`). Do not treat demo subtitles as live Gemini evidence.

## Docs

1. `docs/REQUIREMENTS.md` — product specification  
2. `design/Luma_Translation_Mockup.html` — visual reference  
3. `docs/IMPLEMENTATION.md` / `docs/SOURCES.md` — architecture and upstream links  
4. `docs/superpowers/plans/2026-09-28-luma-foundation.md` — foundation plan  
