# Electron Phase B — Process Loopback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture audio from only the selected Windows process (WASAPI process loopback) so desktop Text + voice works without feedback.

**Architecture:** Native `@luma/win-audio` N-API addon runs in Electron main; renderer picks a window (HWND→PID), starts loopback over IPC, and feeds PCM into a new `ProcessLoopbackCaptureAdapter` that exposes a `MediaStream` via `MediaStreamTrackGenerator` (fallback: AudioWorklet bridge). LiveWorkspace treats `voicePlaybackSafe === true` for this path.

**Tech Stack:** Electron, N-API C++, WASAPI `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`, TypeScript, existing `@luma/audio` encoder/monitor

## Global Constraints

- Never use the microphone
- Process loopback include target process tree; Luma PID must not be the target
- Text + voice only when process-loopback session succeeds
- Screen selection: no process loopback — require an app window (clear error)
- Min OS: Windows 10 build ≥ 20348 / Windows 11; runtime `isSupported()`
- System-wide `audio: 'loopback'` is text-only fallback only, not the primary path
- Keep contextIsolation / sandbox / no Node in renderer

## File map

| Path | Responsibility |
|---|---|
| `packages/win-audio/` | Native addon + JS loader |
| `packages/audio/src/process-loopback-capture.ts` | Renderer adapter + PCM→MediaStream bridge |
| `packages/audio/src/types.ts` | Extend `CaptureAdapter` / capture API list |
| `apps/desktop/src/main/win-audio-host.ts` | Load addon; PCM fan-out to capture session |
| `apps/desktop/src/main/pick-source.ts` | Attach `processId` via native HWND→PID |
| `apps/desktop/src/shared/ipc.ts` | Capture IPC channels |
| `apps/desktop` preload + App/LiveWorkspace wiring | Start process capture instead of getDisplayMedia when desktop |
| `docs/feasibility/` + STATUS/CHECKLIST | F-05 notes |

---

### Task 1: `@luma/win-audio` native package

**Files:** create `packages/win-audio/package.json`, `binding.gyp`, `src/win_audio.cc`, `index.js`, `index.d.ts`

- [ ] Scaffold package with `isSupported()`, `hwndToPid(hwnd)`, `startProcessLoopback(pid)`, `stop()`, PCM callbacks via N-API ThreadSafeFunction
- [ ] Implement WASAPI process loopback (Microsoft Application Loopback pattern); float or PCM16 stereo/mono → callback
- [ ] `pnpm --filter @luma/win-audio build` on Windows; skip compile on non-Windows with stub `isSupported() === false`
- [ ] Unit-free smoke: load module in Node and call `isSupported()`
- [ ] Commit

### Task 2: Electron main host + IPC + picker PID

**Files:** `win-audio-host.ts`, extend `ipc.ts`, `preload`, `pick-source.ts`, `main/index.ts`

- [ ] IPC: `capture:isSupported`, `capture:start` `{pid,label}`, `capture:stop`, events `capture:pcm`, `capture:ended`, `capture:error`
- [ ] Picker items include `processId` (native hwnd→pid); reject screens for process path
- [ ] Replace display-media auto loopback as primary: desktop Choose source → picker → process start
- [ ] Commit

### Task 3: `ProcessLoopbackCaptureAdapter` + LiveWorkspace desktop branch

**Files:** `packages/audio/...`, `LiveWorkspace.tsx` or desktop `App` wrapper

- [ ] Adapter `start({ processId, label })` via `window.lumaDesktop` capture API; build MediaStream from PCM; `voicePlaybackSafe: true`
- [ ] Desktop select-source uses adapter instead of `BrowserCaptureAdapter`
- [ ] Activity meter + `attachPcmPipeline` work with bridged stream
- [ ] Update voice help copy for process-loopback success
- [ ] Tests: adapter types / capture policy lists process loopback when flagged
- [ ] Commit

### Task 4: Docs + verify

- [ ] STATUS/CHECKLIST/README Phase B; F-05 evidence stub
- [ ] Manual: pick Teams/Chrome window, subtitles, enable Text + voice without feedback
- [ ] Commit

## Manual acceptance

1. Supported Windows + rebuilt native module for Electron ABI  
2. Choose window with audio → listening + subtitles  
3. Text + voice on → no runaway echo from Luma TTS  
4. Cancel picker → cancelled state  
5. Unsupported build → clear error, no silent “supported” claim  
