# Foundation verification checklist

Date: 28 September 2026  
Branch: `feat/luma-foundation`  
Scope: Plan 1 foundation (demo web MVP + Go stub). Live Gemini and Electron are out of scope.

## Automated results

| Check | Result |
|---|---|
| `pnpm --filter @luma/translation test` | pass (7) |
| `pnpm --filter @luma/audio test` | pass (4) |
| `cd services/api; go test ./...` | pass |
| `pnpm --filter @luma/web build` | pass (Next.js 15.5.26) |
| Playwright demo smoke (`apps/web`) | pass (system Chrome channel; Playwright browser download timed out) |

## Requirements mapping (foundation)

| ID | Requirement slice | Status |
|---|---|---|
| CTL-01 Start/Pause/Stop/Clear | Demo session controls | pass (demo) |
| CTL-02 Pause stops outbound audio | `isSendingAudio()` false when paused | pass (unit) |
| CTL-03 Stop releases / rejects stale | generation ID rejection | pass (unit) |
| CTL-04 One session | single controller instance in UI | pass (demo wiring) |
| CAP-03 No microphone | `BrowserCaptureAdapter` uses only `getDisplayMedia`; source guard tests | pass (unit); live browser proof still pending F-04 |
| CAP-04 Explicit source selection | Demo dialog; live chooser not wired in demo | pass (demo); live pending |
| LNG-01 Source language | Korean only enabled | pass (UI + capabilities) |
| LNG-02 Language filter | `shouldDisplayTranslation` + mock English skip | pass (unit/mock); live filter pending F-02 |
| TXT-01 Incremental text | Mock emits during session | pass (demo) |
| TXT-02 Partial/final | Assembler revises in place | pass (unit) |
| SEC-01 No permanent key in clients | `.env.example` server-only; no `NEXT_PUBLIC_` secrets | pass |
| SEC-02 Short-lived tokens | Endpoint returns `CONFIGURATION_MISSING` / not configured — never a fabricated token | pass (Go tests) |
| COST / F-06 Quotas | No invented remaining minutes in capabilities | pass (Go tests) |
| CAP-01/02/08–11 Live capture | Real Teams/YouTube/Windows capture | pending verification (F-04/F-05) |
| F-01 Live translated text | Gemini streaming English from Korean audio | pending verification — blocker: credentials / provider path |
| F-03 Ephemeral auth | Real Google mint | pending verification — blocker: mint not configured |
| WIN-01 Electron window | Desktop app | pending verification — blocker: out of foundation scope |

## Feasibility gates

See `docs/feasibility/STATUS.md` for per-gate status and concrete blockers.
