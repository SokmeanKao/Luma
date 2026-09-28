# Electron Phase B — Per-process Windows audio capture

**Date:** 2026-09-29  
**Status:** Approved (design conversation); awaiting implementation after plan  
**Requirements:** F-05, CAP-02, WIN-01 (already Phase A), Text + voice safety on desktop  
**Depends on:** Electron Phase A (`feat/electron-phase-a` shell, float, window picker UI)  
**Out of scope:** Installer/signing, macOS, Chrome-tab capture inside Electron, system-wide loopback as the primary live path

## Goal

Capture **playback audio from only the user-selected window’s process** (and optionally its child processes) on Windows, without the microphone, so:

1. Teams / browser / media apps can be translated in the desktop client (F-05).
2. Luma’s **translated voice** is not re-captured (different PID) → **Text + voice** can be enabled safely on desktop.
3. Capture scope is documented honestly: selected process tree, not “all PC audio.”

## Non-goals

- Replacing Phase A floating window / secure shell
- Using Electron `audio: 'loopback'` (system-wide) as the production live capture path
- Microphone capture or any `getUserMedia({ audio: true })` mic path
- Guaranteeing capture on Windows builds older than process-loopback support
- Shipping a signed installer in this phase

## Problem with Phase A capture

Phase A uses `setDisplayMediaRequestHandler` + `audio: 'loopback'`, which is **system playback mix**. Choosing a window only selects the **video** source; audio remains whole-device loopback. Playing translated speech on the same output re-enters the mix → feedback. Hence Text + voice stays disabled.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer (workspace)                                        │
│  - Source picker → process id + display name                │
│  - ProcessLoopbackCaptureAdapter.start({ pid })             │
│  - voicePlaybackSafe = true when this adapter succeeds      │
│  - Existing Gemini / session / Text + voice UI               │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (narrow)
┌──────────────────────────▼──────────────────────────────────┐
│ Electron main                                               │
│  - Enumerate windows → HWND / PID                           │
│  - Start/stop native capture; forward PCM frames            │
│  - Never expose Node to renderer                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ N-API
┌──────────────────────────▼──────────────────────────────────┐
│ @luma/win-audio (native addon, Windows-only)                │
│  - ActivateAudioInterfaceAsync + PROCESS_LOOPBACK           │
│  - TargetProcessId + INCLUDE process tree                   │
│  - Emit PCM (mono or stereo → downmix in @luma/audio)       │
└─────────────────────────────────────────────────────────────┘
```

### Package layout

| Path | Responsibility |
|---|---|
| `packages/win-audio/` | Native N-API addon + thin TS types; builds only on Windows |
| `packages/audio` | New `ProcessLoopbackCaptureAdapter` implementing `CaptureAdapter` |
| `apps/desktop` | IPC for list/start/stop; picker shows windows with PID; prefer process adapter |
| `docs/feasibility/` | F-05 evidence: mic denied, capture scope, Text + voice note |

### Capture adapter contract

Reuse existing `CaptureAdapter` / `CaptureStartResult`:

- `start({ processId, onEnded, onError })` → `MediaStream`-like or raw PCM push into the existing encoder path  
  **Decision:** Prefer delivering a **MediaStreamTrack** via a Web Audio / MediaStreamTrackGenerator bridge in the renderer **or** push PCM chunks directly into the existing PCM encoder used by LiveWorkspace. Prefer **PCM chunk callback into the same path as display-media PCM** to avoid MediaStreamTrackGenerator availability gaps in Electron. Exact wiring is locked in the implementation plan; product behavior is identical: PCM → Gemini, no mic.
- `stop()` releases WASAPI client and IPC resources.
- `label` = window / process name from picker.
- `displaySurface` = `'window'` (semantic).
- `voicePlaybackSafe` = **`true`** for successful process-loopback sessions.
- `localPlaybackSuppressed` = `false` (OS still plays the app’s audio normally; Luma may duck via existing monitor only if a separate tap exists — ducking original app audio is best-effort / optional in Phase B).

### Source picker

- Keep Phase A picker UI; extend items with `processId: number` (from `desktopCapturer` / native window enumeration).
- Prefer listing **windows** with a valid PID; screens alone cannot use process loopback — selecting a screen falls back to system loopback **or** is rejected with a clear message (“Pick an app window for Text + voice”).
- **Product rule:** Live desktop sessions that want Text + voice require a **window** selection with PID. Screen selection remains text-only via legacy system loopback if retained as fallback.

### Text + voice gating

| Capture mode | `voicePlaybackSafe` | Text + voice |
|---|---|---|
| Web Chrome tab (`displaySurface === 'browser'`) | true when suppress path OK | Allowed (unchanged) |
| Desktop process loopback | **true** | **Allowed** |
| Desktop system loopback / screen | false | Disabled |

Update LiveWorkspace / desktop copy so process-loopback sessions no longer say “Unavailable for desktop system audio.”

### Native addon (`@luma/win-audio`)

- Built with `node-gyp` / `cmake-js` against Electron’s Node ABI (electron-rebuild or `@electron/rebuild`).
- Runtime check: `isProcessLoopbackSupported()` → false on non-Windows or build too old.
- API sketch:

```ts
type WinAudioApi = {
  isSupported(): boolean;
  listAudioProcesses(): Promise<Array<{ pid: number; name: string }>>;
  startProcessLoopback(opts: {
    pid: number;
    includeProcessTree: boolean;
    sampleRate: number; // e.g. 48000 device rate; resample in @luma/audio
  }): Promise<void>;
  stop(): Promise<void>;
  onPcm(cb: (chunk: Int16Array | Buffer, meta: { sampleRate: number; channels: number }) => void): () => void;
};
```

- Modes: `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE` for the selected app.
- Never activate microphone capture endpoints for this feature.
- Handle process exit → emit ended → UI stops session cleanly.

### Fallback

If addon missing, unsupported OS, or start fails:

1. Show clear error (“Per-app audio needs Windows 10 21H2+ / 11 and a rebuilt desktop native module”).
2. Optional: offer Phase A system loopback for **text-only** (explicit user choice), Text + voice remains off.
3. Do not silently claim F-05 complete when using system loopback.

### Security (SEC-01)

- No Gemini keys in the addon or desktop package.
- Narrow IPC: list sources, start(pid), stop, pcm events — validate pid is a positive integer; reject arbitrary paths.
- Keep `contextIsolation` / `sandbox` / no Node in renderer.

### Testing / F-05 evidence

| Check | Expectation |
|---|---|
| Unit | Mock adapter sets `voicePlaybackSafe`; IPC pid validation |
| Manual Windows | Pick Teams or Chrome window; Korean/English speech → subtitles; mic permission denied in OS still works |
| Manual voice | Enable Text + voice; translated playback does not appear as new “original” / runaway feedback |
| Docs | Record OS build, whether other apps were audible in capture, mic-denied proof |

### Acceptance checklist

- [ ] Window pick → process loopback start succeeds on supported Windows
- [ ] No microphone API used
- [ ] Text + voice enabled and usable without obvious feedback from Luma TTS
- [ ] Screen-only / unsupported path does not silently enable voice
- [ ] STATUS / CHECKLIST: F-05 evidence updated; capture scope documented
- [ ] Phase A float / shell still works

## Decisions locked

| Decision | Choice |
|---|---|
| Capture tech | WASAPI process loopback via native addon |
| System-wide Electron loopback | Fallback / text-only only, not primary |
| Text + voice on desktop | Enabled only for process-loopback sessions |
| Screen selection | No process loopback; text-only fallback or require window |
| Mic | Never |

## Implementation order (preview)

1. Scaffold `@luma/win-audio` + rebuild story for Electron  
2. Main IPC + picker PID wiring  
3. `ProcessLoopbackCaptureAdapter` + LiveWorkspace desktop branch  
4. Enable Text + voice gating  
5. F-05 evidence docs + STATUS  
