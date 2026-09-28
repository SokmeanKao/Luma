# Luma five-stage implementation plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Demo success ≠ live translation success.

**Goal:** Deliver Luma through five working stages without representing demo behavior as verified live features.

**Architecture:** pnpm monorepo; Next.js App Router web; Go loopback token service; Electron desktop later. Capture adapters separate from translation providers. Explicit modes: `demo` | `capture` | `live`.

**Tech Stack:** Next.js latest stable (verified at implement time), TypeScript, pnpm, Go, Electron, Maven Pro + Korean fallback.

## Global Constraints

- Never request microphone (`getUserMedia` mic path forbidden).
- Permanent Gemini keys server-side only; no fabricated live-tokens.
- Demo / capture / live modes always visually distinct.
- Do not enable billing, push, or deploy.
- F-04 capture evidence must be real Chrome/Edge manual results — not Playwright mocks.
- Proceed to Gemini (Stage 3) only after capture evidence recorded and free-tier eligibility checked.
- Keep independent work moving when a gate is blocked.

## Stage status

| Stage | Status |
|---|---|
| 1 Foundation | In progress → close gaps then mark complete |
| 2 Browser capture | Next |
| 3 Gemini + filtering | Blocked until Stage 2 evidence + credentials/eligibility |
| 4 Web live integration | After Stage 3 |
| 5 Windows Electron | After Stage 4 or parallel stub only |

---

### Task A: Close Stage 1 gaps

**Files:**
- Create: `apps/desktop/package.json` (placeholder Electron package)
- Modify: `apps/web/src/app/layout.tsx` — Noto Sans KR fallback CSS variable
- Modify: `docs/CHECKLIST.md`, `README.md` — Next 16.3.6 versions
- Create: `docs/STAGES.md` — five-stage tracker

- [ ] Desktop package stub named `@luma/desktop` with scripts echoing “Stage 5”
- [ ] Maven Pro + Noto Sans KR on root body stack
- [ ] Re-run lint, typecheck, tests, build; update checklist
- [ ] Commit

### Task B: Stage 2 capture mode (no Gemini)

**Files:**
- Create: `packages/audio/src/activity-meter.ts` — AnalyserNode RMS/level 0–1
- Modify: `packages/audio/src/browser-capture.ts` — prefer tab audio constraints where supported
- Create: `apps/web/src/components/CapturePanel.tsx` — select source, level meter, stop
- Modify: `apps/web/src/app/page.tsx` — mode switch Demo | Capture test | Live (disabled)
- Create: `docs/feasibility/F04_CAPTURE_EVIDENCE.md` — Chrome/Edge manual matrix (blank results for human fill)
- Update: `docs/feasibility/STATUS.md` F-04 notes

**Behavior:**
- Capture test mode: Select audio source → `getDisplayMedia` → require audio track → show activity meter from playback → Stop stops all tracks. No mock subtitles. No Gemini.
- Cancel → toast/status, no session.
- No audio track → actionable error.
- Track ended → status “Source ended”.
- Demo mode unchanged (mock dialog + sample subtitles).

- [ ] Unit-test activity meter helpers with synthetic Float32Array
- [ ] Build + lint pass
- [ ] Commit
- [ ] Leave evidence table for human Chrome/Edge runs

### Task C–E: Stages 3–5

Deferred plans to be written when Stage 2 evidence exists and eligibility is confirmed. Do not implement live Gemini until then.
