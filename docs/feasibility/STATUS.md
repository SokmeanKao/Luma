# Feasibility checklist (web real app)

Updated after worktree → `C:\Dev\Luma` migration and UX polish on `main`.

## Milestone

**Web implementation complete enough for live validation** — not “all requirements complete.”  
Windows browser support does **not** mean the Electron desktop app exists.

Earlier audit items already fixed later (docs drift, restart history, friendly errors, `providerAvailable`, capture-policy test) stay closed. Deferred gates below remain **unverified** until operator evidence is recorded.

| Gate / item | Status | Notes |
|---|---|---|
| Native Select audio source | implemented | `getDisplayMedia` from user click; no simulated YouTube card |
| Mic never requested | implemented | display-media only + `capture-policy` unit |
| Video not sent to Gemini | implemented | audio PCM path only |
| Temporary token via Go | verified (documented) | v1beta mint HTTP 200 in F-01 |
| English subtitles from Korean | **partial** | PCM smoke EN text recorded; **browser tab capture E2E still pending** |
| Selectable language pairs | implemented | Searchable from/to; catalog-driven |
| Language filter | **unverified** | Session + audio-gate wiring present; E2E matrix pending |
| Voice + ducking E2E | **unverified** | Code present; suppress-capable tab proof pending |
| `NEXT_PUBLIC_LUMA_MODE` | **live** | Supported: `live` \| `capture` \| `demo` |
| F-04 Chrome/Edge capture matrix | **pending** | Env versions recorded; matrix empty |
| F-05 Electron | **deferred / missing** | `apps/desktop` stub only |
| Demo | explicit only | `?demo=1` — never silent fallback |

## Automated

| Check | Result |
|---|---|
| translation / audio / Go tests | pass |
| web typecheck + Playwright fixtures | pass |
| live-token mint | documented HTTP 200 (requires local `.env` gates) |

## Manual (operator) — deferred / unverified

| Scenario | Result |
|---|---|
| Korean YouTube → English subtitles | pending |
| Other tab exclusion | pending |
| Pause/Resume/Stop | pending |
| Cancel / no-audio / source close | pending |
| English-only filtering | pending |
| Teams meeting | pending |
| Voice / ducking on real tab | pending |

## Browsers recorded

| Browser | Version |
|---|---|
| Chrome | 154.0.8037.57 |
| Edge | 154.0.4258.37 |
