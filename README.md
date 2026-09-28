# Luma

Personal live audio translation companion. The default app captures **browser tab playback** (not the microphone), streams it to Gemini Live Translate, and shows near-real-time dual transcripts (original + translation). Korean → English is the primary pair; other catalog pairs are selectable.

## Workspace layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js App Router — `LiveWorkspace` (default) |
| `apps/desktop` | Electron Phase A — secure shell + floating subtitles (same live UI; tab capture) |
| `packages/ui` | Shared React controls (dual transcript, status, brand) |
| `packages/translation` | Gemini Live provider, session, language filter, mock (tests/demo) |
| `packages/audio` | `getDisplayMedia` capture + PCM encoder (no microphone) |
| `services/api` | Go loopback API: health, capabilities, ephemeral live-token mint |
| `docs/feasibility/STATUS.md` | Per-gate feasibility status |

## Start (PowerShell)

Terminal 1 — Go API (loads repo-root `.env`):

```powershell
cd C:\Dev\Luma\services\api
go run ./cmd/server
```

Terminal 2 — Next.js:

```powershell
cd C:\Dev\Luma
pnpm install
pnpm --filter @luma/web dev --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000

### Electron desktop (Phase A)

With the Go API still running:

```powershell
cd C:\Dev\Luma
pnpm --filter @luma/desktop dev
```

Same live session UX as web (tab/`getDisplayMedia` capture). Use **Floating subtitles** / **Always on top** for the compact companion window. Native Windows loopback capture (F-05) is not implemented yet.

1. Choose **From** / **To** languages
2. Click **Choose audio source** → pick a **Chrome Tab** (Teams / YouTube) → enable **Share tab audio**
3. Translation **starts automatically** after you approve sharing
4. Use **Pause** / **Resume** / **Stop** as needed
5. Optional: switch to **Text + voice** only when the source is a browser tab (window / entire screen stay text-only to avoid feedback)

Privacy label in the UI: **Playback audio only · Microphone not captured**.

Never enable billing, push, or deploy from this MVP path unless you explicitly intend to.

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
| **Demo** | `/?demo=1` | Explicit sample UI for layout/tests only |
| **Preview states** | `/preview/transcript?state=…` | Static empty / ready / listening / paused / error fixtures |

## Automated checks

```powershell
cd C:\Dev\Luma
pnpm --filter @luma/translation test
pnpm --filter @luma/audio test
pnpm --filter @luma/web typecheck
cd services\api; go test ./...
cd ..\..\apps\web; pnpm exec playwright test --reporter=line
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
| `docs/feasibility/STATUS.md` | Checklist / milestone framing |
| `docs/feasibility/F01_LIVE_TRANSLATE_EVIDENCE.md` | Live translate + filter |
| `docs/feasibility/F04_CAPTURE_EVIDENCE.md` | Chrome/Edge capture matrix |
| `docs/ux/README.md` | Production UX notes (local screenshots stay gitignored) |

Electron / Windows installer (F-05) starts after web verification.
