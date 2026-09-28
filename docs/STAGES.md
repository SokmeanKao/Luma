# Luma five-stage tracker

Demo / Capture-test success is never treated as live translation success.

| Stage | Name | Status | Notes |
|---|---|---|---|
| 1 | Foundation | **complete** | Demo web + Go stub + Next 16.3.6 |
| 2 | Browser capture | **implementation complete**; F-04 evidence pending human runs | Use Capture test on http://localhost:3000 |
| 3 | Gemini + filtering | **independent implementation in progress** | Token mint opt-in, PCM pipeline, provider interfaces, failure handling. Live UI off. Provider verification pending credentials/eligibility. |
| 4 | Web live integration | blocked on Live enablement gates | |
| 5 | Windows Electron | **Phase A shell**; F-05 loopback pending | `pnpm --filter @luma/desktop dev` |

F-04 evidence does **not** block Stage 3 coding; it blocks claiming capture verified and later Live E2E.
