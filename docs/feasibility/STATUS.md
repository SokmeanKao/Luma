# Feasibility gates

Recorded for the Luma five-stage plan. Mock/demo behavior is **not** live provider evidence. Capture-test mode is **not** translation evidence.

| Gate | Status | Blocker / notes |
|---|---|---|
| F-01 Translated text | pending verification | **Blocker:** no Gemini credentials exercised. Demo mock subtitles are not live evidence. Stage 3 not started. |
| F-02 Source-language filtering | pending verification | **Blocker:** live filter unverified. Mock skip ≠ provider evidence. |
| F-03 Authentication / ephemeral tokens | pending verification | **Blocker:** live-token returns `CONFIGURATION_MISSING` / not configured; no Google mint. |
| F-04 Web capture | pending verification | Capture-test UI + activity meter implemented (no Gemini). **Remaining:** fill `docs/feasibility/F04_CAPTURE_EVIDENCE.md` with real Chrome/Edge Windows results. |
| F-05 Windows capture | pending verification | **Blocker:** `@luma/desktop` stub only; Electron Stage 5 not implemented. |
| F-06 Quota / session limits | pending verification | **Blocker:** no live quota measurement; requires credentials + project dashboard. |

## Stage gating

- Stage 3 (Gemini) must not start until F-04 evidence is recorded and free-tier eligibility is checked.
- Never represent Demo or Capture-test success as Live translation success.
