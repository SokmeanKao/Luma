# Foundation + Stage 2 verification checklist

Date: 28 September 2026  
Branch: `feat/luma-foundation`  
Next.js: **16.3.6** (`pnpm view next dist-tags.latest` → 16.3.6)

## Automated results

| Check | Result |
|---|---|
| `pnpm --filter @luma/translation test` | pass |
| `pnpm --filter @luma/audio test` | pass (includes activity meter) |
| `cd services/api; go test ./...` | pass |
| `pnpm --filter @luma/web lint` | pass |
| `pnpm --filter @luma/web typecheck` | pass |
| `pnpm --filter @luma/web build` | pass (Next.js 16.3.6 / Turbopack) |
| Playwright demo smoke | pass (system Chrome) |

## Modes (must stay distinct)

| Mode | Behavior | Claims translation? |
|---|---|---|
| Demo | Mock source dialog + sample subtitles | No — labeled demo |
| Capture test | Real `getDisplayMedia` + activity meter | No — labeled no Gemini |
| Live | Disabled until gates pass | N/A |

## Stage 2 manual evidence

See `docs/feasibility/F04_CAPTURE_EVIDENCE.md` — **pending human Chrome/Edge runs**.

## Requirements mapping (selected)

| ID | Status |
|---|---|
| CTL-01–04 | pass (demo unit/UI) |
| CAP-03 no mic | pass (unit + capture path uses display media only); live mic-denied proof pending F-04 |
| CAP-04/08 chooser | pass in capture-test path (implementation); manual cancel proof pending F-04 |
| F-01–F-03, F-06 | pending / blocked on credentials |
| F-04 | pending verification (implementation ready; evidence blank) |
| F-05 | blocked (Electron stub) |
| Live Teams/YouTube E2E | pending Stage 4 |
