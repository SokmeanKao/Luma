# F-04 Web capture evidence

**Do not mark this gate pass from Playwright or demo mode.** Fill after real Chrome and Edge runs on Windows.

Environment:

| Field | Value |
|---|---|
| Date | 2026-09-28 |
| Windows build | 25H2 / 26200 |
| Chrome version | 154.0.8037.57 |
| Edge version | 154.0.4258.37 |
| Luma commit | db784b9 (+ pending session harden) |
| Mode used | Live app Select audio source (`getDisplayMedia`) |

## Manual matrix

| Manual test | Chrome result (pass/fail/notes) | Edge result (pass/fail/notes) |
|---|---|---|
| Play YouTube speech → audio activity appears | pending | pending |
| Speak into microphone while playback silent → no activity | pending | pending |
| Play sound in another tab → excluded in selected-tab capture | pending | pending |
| Cancel sharing dialog → no session / no capture | pending | pending |
| Share source without audio → clear instructions | pending | pending |
| Close captured tab → capture ends, status updates | pending | pending |
| Share presentation window in Teams → meeting capture continues | pending | pending |
| Microphone permission denied / blocked → capture still works | pending | pending |

## Notes / blockers

- Automated Playwright cannot exercise the native sharing dialog or prove tab isolation.
- Implementation opens `getDisplayMedia` from the Select audio source button; validates a live audio track; never requests the microphone.

## Verdict

- F-04 status: **pending verification** until this table is filled with real browser results.
