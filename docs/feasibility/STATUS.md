# Feasibility gates

| Gate | Status | Notes |
|---|---|---|
| F-01 Translated text | pending verification | Live test wired (capture→PCM→Gemini→output transcripts). **Not marked pass** until English text from Korean audio is recorded in `F01_LIVE_TRANSLATE_EVIDENCE.md`. |
| F-02 Source-language filtering | unverified | `echoTargetLanguage=false` ≠ Korean-only. Live test labeled accordingly; product Live stays off. |
| F-03 Ephemeral tokens | implementation ready | v1beta constrained mint; requires `FREE_TIER_ELIGIBILITY_CONFIRMED=true`. Token success ≠ translation success. |
| F-04 Web capture | pending verification | Manual Chrome/Edge matrix still required (`F04_CAPTURE_EVIDENCE.md`). |
| F-05 Windows | pending | Electron stub. |
| F-06 Quota | pending | No live quota numbers claimed. |

## Modes

| Mode | Behavior |
|---|---|
| Demo | Mock samples only |
| Capture test | Real capture, no Gemini |
| Live test | Dev-only live path; no demo fallback on failure |
