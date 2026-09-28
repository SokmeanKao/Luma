# Luma

Personal live audio translation companion (Korean → English). Default UI is the **real** tab-capture → Gemini Live Translate → English subtitles flow. Demo samples are explicit-only (`Open Dev demo`).

## Workspace layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js App Router — LiveWorkspace (default) |
| `packages/ui` | Shared React controls and styles (Maven Pro + Noto Sans KR) |
| `packages/translation` | Gemini Live provider, session, language filter, mock (tests/demo) |
| `packages/audio` | `getDisplayMedia` capture + PCM encoder (no microphone) |
| `services/api` | Go loopback API: health, capabilities, ephemeral live-token mint |
| `docs/feasibility/STATUS.md` | Per-gate feasibility status |

## Start (PowerShell)

Terminal 1 — Go API (loads repo-root `.env`):

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation\services\api
go run ./cmd/server
```

Terminal 2 — Next.js:

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
pnpm install
pnpm dev
```

Open http://localhost:3000

1. **Select audio source** → choose a YouTube/Teams tab → enable **Share tab audio**
2. Confirm the activity meter moves with playback
3. **Start translation** → English subtitles from Korean speech

Never enable billing, push, or deploy from this MVP path.

## Credentials (local only)

See `docs/ENV_SETUP.md`. Never commit `.env`. Never put `GEMINI_API_KEY` in `NEXT_PUBLIC_*`.

| Variable | Where | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `.env` (Go) | Permanent key, backend only |
| `GEMINI_MODEL` | `.env` | e.g. `gemini-3.5-live-translate-preview` |
| `ENABLE_LIVE_TOKEN_MINT` | `.env` | `true` for local mint |
| `FREE_TIER_ELIGIBILITY_CONFIRMED` | `.env` | `true` only after you verify free-tier eligibility |
| `NEXT_PUBLIC_API_BASE` | `.env` | `http://127.0.0.1:8080` |

## Modes

| Mode | How | Notes |
|---|---|---|
| **Live (default)** | Homepage | Real capture + Gemini; failures never fall back to demo |
| **Dev demo** | Sidebar “Open Dev demo” | Sample subtitles only |

## Automated checks

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
pnpm --filter @luma/translation test
pnpm --filter @luma/audio test
pnpm --filter @luma/web build
cd services\api; go test ./...
```

Mint smoke (does **not** prove translation):

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/v1/live-token `
  -ContentType 'application/json' `
  -Body '{"sourceLanguage":"ko","targetLanguage":"en"}'
```

## Evidence

| Doc | Purpose |
|---|---|
| `docs/feasibility/STATUS.md` | Checklist |
| `docs/feasibility/F01_LIVE_TRANSLATE_EVIDENCE.md` | Live translate + filter |
| `docs/feasibility/F04_CAPTURE_EVIDENCE.md` | Chrome/Edge capture matrix |

Electron / Windows installer (F-05) starts after web verification.
