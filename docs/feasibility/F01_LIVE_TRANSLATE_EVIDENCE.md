# F-01 Live Translate evidence

Token minting alone does **not** prove translation, free-tier eligibility, or session duration.

## Environment

| Field | Value |
|---|---|
| Date | 2026-09-28 |
| Commit | db784b9 (+ pending session-id/reconnect harden) |
| Model (`GEMINI_MODEL`) | gemini-3.5-live-translate-preview |
| `FREE_TIER_ELIGIBILITY_CONFIRMED` | true (local; dashboard evidence still required) |
| AI Studio project (id only, no key) | pending operator |
| Observed free-tier limits | pending operator |
| Browser | Chrome 154.0.8037.57 / Edge 154.0.4258.37 |

## Free-tier eligibility checklist (required before Live test audio)

| Check | Result |
|---|---|
| Model appears available for this project without enabling billing | pending operator |
| Rate-limit / quota dashboard inspected | pending |
| `FREE_TIER_ELIGIBILITY_CONFIRMED=true` set intentionally | true (local gate open for short tests) |

If eligibility is unconfirmed, set `FREE_TIER_ELIGIBILITY_CONFIRMED=false` and restart the API.

## Backend mint (not translation proof)

| Check | Result |
|---|---|
| `POST /api/v1/live-token` | HTTP 200, api=v1beta, temporary credential minted |
| Permanent key on backend only | yes (not in web bundle) |

## Live test runs (short samples)

| Run | Pair | Source media | First subtitle ms | Target text observed? | Errors | Notes |
|---|---|---|---|---|---|---|
| 1 | ko→en | pending | pending | pending | pending | Only verified pair in catalog today |
| — | ja→en | — | — | — | — | **Not in catalog** until real-audio verification |
| — | ko→fr | — | — | — | — | **Not in catalog** until real-audio verification |

Dropdown options come only from `supportedPairs` in `/api/v1/capabilities`. Provider language lists alone do **not** add a pair.

## Filtering (separate from F-01)

| Case | Expected | Result | Notes |
|---|---|---|---|
| Korean → English subtitles | Text appears | pending | |
| English-only | No subtitle entry | pending | `echoTargetLanguage=false` is not Korean-only |
| Other language | No subtitle entry | pending | |
| Korean + English terms | Meaningful EN | pending | |
| Silence | No fabricated text | pending | |

**Filter status remains `unverified` until this table is filled.**

## Pause / Stop

| Check | Result |
|---|---|
| Pause stops outbound audio (meter may still move; no new Gemini send) | pending |
| Stop releases tracks, closes WS, rejects late results | pending (session/generation guards implemented) |

## Verdict

- F-01: **pending** until English text from Korean audio is recorded above
- F-02: **pending** until filter matrix filled
- F-03: mint path exercised (200 OK); not sufficient alone
- F-04: still pending Chrome/Edge capture matrix
- F-06: pending live quota observations
