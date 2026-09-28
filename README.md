# Luma

Personal live audio translation companion (Korean → English initially). Web MVP with explicit **demo mode**, shared packages, and a Go token-service stub that returns **not configured** (never a fabricated token).

## Workspace layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js App Router UI (demo mode default) |
| `packages/ui` | Shared React controls and styles |
| `packages/translation` | Session state, mock provider, transcript assembly |
| `packages/audio` | Capture/encoder interfaces (display-media only; no microphone) |
| `services/api` | Go health / capabilities / live-token stub |
| `docs/feasibility/STATUS.md` | Per-gate feasibility status |
| `docs/CHECKLIST.md` | Foundation verification checklist |

## Modes

| Mode | What it does |
|---|---|
| **Demo** | Sample subtitles only — not capture, not Gemini |
| **Capture test** | Real browser tab/window share + activity meter — **no Gemini** |
| **Live** | Disabled until F-04 evidence + provider gates pass |

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
pnpm install
pnpm dev
```

Open http://localhost:3000 → use **Capture test** → **Select audio source** → enable Share tab audio. Record results in `docs/feasibility/F04_CAPTURE_EVIDENCE.md`.

## Credentials (local only)

Documented in `docs/ENV_SETUP.md`.

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
Copy-Item .env.example .env
# Edit .env locally — never commit it. Never use NEXT_PUBLIC_ for GEMINI_API_KEY.
```

| Variable | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `.env` / process env for Go | Server-side only |
| `GEMINI_MODEL` | `.env` | Required before mint |
| `ENABLE_LIVE_TOKEN_MINT` | `.env` | Default `false` |
| `NEXT_PUBLIC_API_BASE` | `.env` | Public loopback URL only |

Live UI stays disabled until integration gates pass. Billing, push, and deploy remain off.



Go API (separate terminal):

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation\services\api
go test ./...
go run ./cmd/server
```

Health: http://127.0.0.1:8080/healthz  
Live token (always not configured):

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/v1/live-token `
  -ContentType 'application/json' `
  -Body '{"sourceLanguage":"ko","targetLanguage":"en"}'
```

### Tests

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
pnpm --filter @luma/translation test
pnpm --filter @luma/audio test
pnpm --filter @luma/web build
cd services\api; go test ./...
cd ..\..\apps\web; pnpm exec playwright test
```

Playwright uses the system Chrome channel (`channel: 'chrome'`) because downloading Playwright’s bundled Chromium timed out in this environment.

### Environment

Copy `.env.example` to `.env` if needed. Never put provider secrets in `NEXT_PUBLIC_*`. Default `NEXT_PUBLIC_LUMA_MODE=demo`.

## Docs

1. `docs/REQUIREMENTS.md` — product specification  
2. `design/Luma_Translation_Mockup.html` — visual reference  
3. `docs/IMPLEMENTATION.md` / `docs/SOURCES.md` — architecture and upstream links  
4. `docs/superpowers/plans/2026-09-28-luma-foundation.md` — foundation plan  
5. `docs/feasibility/STATUS.md` — gate status  
6. `docs/CHECKLIST.md` — verification mapping  
