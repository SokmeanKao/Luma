# Feasibility checklist (web real app)

Updated after switching the default UI to the live capture→Gemini flow.

| Gate / item | Status | Notes |
|---|---|---|
| Native Select audio source | implemented | `getDisplayMedia` from user click; no simulated YouTube card |
| Mic never requested | implemented | display-media only |
| Video not sent to Gemini | implemented | audio PCM path only |
| Temporary token via Go | implemented | v1beta mint verified HTTP 200 |
| English subtitles from Korean | **pending manual** | Run YouTube Korean sample; record in F01 |
| Language filter | **unverified** | Suppresses non-`ko` when `languageCode` present; not proven E2E |
| F-04 Chrome/Edge capture matrix | **pending** | Env versions recorded; matrix empty |
| F-05 Electron | pending | After web verification |
| Demo | explicit only | “Open Dev demo” — never silent fallback |

## Automated

| Check | Result |
|---|---|
| translation tests | 16 pass |
| audio tests | 8 pass |
| Go API tests | pass |
| web typecheck/build | pass (Next 16.3.6) |
| live-token mint | HTTP 200 (api=v1beta) |

## Manual (operator)

| Scenario | Result |
|---|---|
| Korean YouTube → English subtitles | pending |
| Other tab exclusion | pending |
| Pause/Resume/Stop | pending |
| Cancel / no-audio / source close | pending |
| English-only filtering | pending |
| Teams meeting | pending |

## Browsers recorded

| Browser | Version |
|---|---|
| Chrome | 154.0.8037.57 |
| Edge | 154.0.4258.37 |
