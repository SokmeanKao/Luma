# Feasibility gates

Mock/demo and Capture-test success are **not** live translation evidence.

| Gate | Status | Blocker / notes |
|---|---|---|
| F-01 Translated text | pending verification | **Not executed** against Gemini in CI. Adapter scaffolding exists; Live UI disabled. Needs credentials + eligibility + live session proof. |
| F-02 Source-language filtering | pending verification | Unit/mock filter helpers exist. Live Korean/English/other/silence matrix **not executed**. |
| F-03 Authentication / ephemeral tokens | pending verification | Mint path coded behind `ENABLE_LIVE_TOKEN_MINT=true` + `GEMINI_API_KEY`. Default remains not configured. Live mint **not marked passed**. |
| F-04 Web capture | pending verification | Capture-test UI ready. **Human Chrome/Edge matrix** in `F04_CAPTURE_EVIDENCE.md` still required to declare capture verified. Does **not** block independent Stage 3 coding. |
| F-05 Windows capture | pending verification | Electron stub only. |
| F-06 Quota / session limits | pending verification | No live quota measurement; no fabricated remaining-minutes. |

## Stage gating (corrected)

- **F-04** blocks declaring **web capture verified**, not all Stage 3 development.
- **Live mode** stays disabled until required integration gates (token + provider + filtering evidence) pass.
- Do not mark unexecuted provider tests as passed.
