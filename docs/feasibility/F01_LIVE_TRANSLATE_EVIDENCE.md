# F-01 Live Translate evidence

Token minting alone does **not** prove translation, free-tier eligibility, or session duration.

## Environment

| Field | Value |
|---|---|
| Date | |
| Commit | |
| Model (`GEMINI_MODEL`) | gemini-3.5-live-translate-preview |
| `FREE_TIER_ELIGIBILITY_CONFIRMED` | |
| AI Studio project (id only, no key) | |
| Observed free-tier limits | |
| Browser | |

## Free-tier eligibility checklist (required before Live test audio)

| Check | Result |
|---|---|
| Model appears available for this project without enabling billing | |
| Rate-limit / quota dashboard inspected | |
| `FREE_TIER_ELIGIBILITY_CONFIRMED=true` set intentionally | |

If any row is blank, Live test correctly blocks mint/audio until filled.

## Live test runs (short Korean sample)

| Run | Source | First subtitle ms | English text observed? | Errors | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |

## Filtering (separate from F-01)

| Case | Expected | Result | Notes |
|---|---|---|---|
| Korean → English subtitles | Text appears | | |
| English-only | No subtitle entry | | `echoTargetLanguage=false` is not Korean-only |
| Other language | No subtitle entry | | |
| Korean + English terms | Meaningful EN | | |
| Silence | No fabricated text | | |

**Filter status remains `unverified` until this table is filled.** Product Live stays disabled.

## Pause / Stop

| Check | Result |
|---|---|
| Pause stops outbound audio (meter may still move; no new Gemini send) | |
| Stop releases tracks, closes WS, rejects late results | |

## Verdict

- F-01: pending until English text from Korean audio is recorded above
- F-02: pending until filter matrix filled
- F-03: mint path exercised separately; constrained v1beta token required for Live test
- F-04: still pending Chrome/Edge capture matrix
- F-06: pending live quota observations
