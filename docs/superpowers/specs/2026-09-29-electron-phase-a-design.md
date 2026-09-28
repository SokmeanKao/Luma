# Electron Phase A — Secure shell + floating window

**Date:** 2026-09-29  
**Status:** Approved (design conversation); awaiting implementation after plan  
**Requirements:** WIN-01 (partial), SEC-01, architecture notes in `docs/REQUIREMENTS.md` §5 and `docs/IMPLEMENTATION.md`  
**Out of scope for Phase A:** F-05 native Windows playback / loopback capture (Phase B), installer/signing, auto-update

## Goal

Ship a runnable Windows Electron client (`@luma/desktop`) that:

1. Loads a local Vite React renderer with **contextIsolation**, **sandbox**, and **no Node integration** in the renderer.
2. Reuses shared packages (`@luma/ui`, `@luma/translation`, `@luma/audio`) and the same live-session UX patterns as `@luma/web`.
3. Offers a compact, optionally **always-on-top** subtitle window (WIN-01).
4. Talks to the existing Go API on `http://127.0.0.1:8080` for capabilities and short-lived live tokens.
5. Continues to use **browser-style `getDisplayMedia`** for capture so Phase A can validate shell, IPC, floating UI, and live session without native loopback.

Phase A does **not** claim F-05 complete. F-05 evidence (Teams desktop playback with mic denied) is Phase B.

## Non-goals

- Native `desktopCapturer` / WASAPI loopback / system-audio exclusive capture
- Code signing, NSIS/MSI installer, auto-update
- Embedding or loading remote privileged web content
- Duplicating Next.js App Router or server components inside Electron
- Shipping permanent Gemini credentials in the desktop package (SEC-01)
- Changing web app behavior except optional shared extractions required for reuse

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron main (Node)                                        │
│  - BrowserWindow (workspace) + BrowserWindow (float)        │
│  - setAlwaysOnTop / show / hide via IPC                     │
│  - session security defaults; no remote content             │
└──────────────────────────┬──────────────────────────────────┘
                           │ contextBridge (narrow API)
┌──────────────────────────▼──────────────────────────────────┐
│ Preload (isolated)                                          │
│  window.lumaDesktop: { setAlwaysOnTop, getAlwaysOnTop,     │
│                        openFloat, closeFloat, onFloatClosed}│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ Vite React renderer                                         │
│  - Workspace: LiveWorkspace-equivalent UI                   │
│  - Float route/page: compact DualTranscript (or subtitle)   │
│  - @luma/audio BrowserCaptureAdapter (getDisplayMedia)      │
│  - @luma/translation GeminiLiveProvider                     │
│  - fetch → Go API 127.0.0.1:8080                            │
└─────────────────────────────────────────────────────────────┘
```

### Process model

| Process | Privileges | Responsibility |
|---|---|---|
| Main | Full Node | Window lifecycle, always-on-top, security webPreferences |
| Preload | Limited bridge | Expose only typed IPC methods listed below |
| Renderer | No Node, sandboxed | UI, capture, streaming, API HTTP |

Do not use `remote` module. Do not enable `nodeIntegration`. Do not use `webSecurity: false`.

### Package layout

```
apps/desktop/
  package.json          # @luma/desktop
  electron.vite.config  # or vite + electron-vite equivalent
  electron/
    main.ts
    preload.ts
  src/                  # renderer
    main.tsx
    App.tsx
    lib/api.ts          # same contract as web; env via import.meta.env
    components/         # desktop-specific shell + float chrome
    styles.css
  index.html
```

Prefer **electron-vite** (or Vite + `electron` with a documented dual-build) so main/preload/renderer share one package script surface:

- `pnpm --filter @luma/desktop dev` → Electron + hot renderer
- `pnpm --filter @luma/desktop build` → packaged renderer + main/preload JS (no installer required in Phase A)
- `pnpm --filter @luma/desktop typecheck` / `lint`

Workspace already includes `apps/*`; replace the Stage 5 echo stub in `apps/desktop/package.json`.

### Shared code strategy

| Shared | How |
|---|---|
| `@luma/ui` | Import DualTranscriptPanel, StatusLine, Brand, SessionControls, etc. |
| `@luma/translation` | Same session controller + Gemini Live provider as web |
| `@luma/audio` | Same `BrowserCaptureAdapter` for Phase A |
| API client | Mirror `apps/web/src/lib/api.ts` contracts; default base `http://127.0.0.1:8080` via `VITE_API_BASE` |
| Live workspace UI | Prefer extracting a shared workspace shell only if duplication becomes painful; Phase A may copy/adapt `LiveWorkspace` into the desktop renderer with desktop chrome (float toggle). Do not pull Next.js into Electron. |

Desktop-specific UI chrome:

- Menu or toolbar control: **Open floating subtitles** / **Always on top**
- Float window: minimal chrome, large readable translation text, optional original toggle if already supported in shared UI
- Main window remains the full session controls + source selection

### Windows (WIN-01)

1. **Workspace window** — primary session UI (source, languages, controls, full dual transcript).
2. **Float window** — compact always-on-top-capable window showing the latest / scrolling translated text (and optional original). Default size ~420×220; user-resizable; frameless or thin frame acceptable if drag region is clear.

IPC (exact surface; expand only with a design amend):

```ts
type LumaDesktopApi = {
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getAlwaysOnTop(): Promise<boolean>;
  openFloat(): Promise<void>;
  closeFloat(): Promise<void>;
  onFloatClosed(cb: () => void): () => void; // unsubscribe
};
```

Main process behavior:

- `openFloat` creates or shows the float `BrowserWindow` with `alwaysOnTop` default **true** on first open; user can toggle off.
- Closing the float window does not stop capture or the translation session.
- Closing the workspace window ends the app (and must tear down media / provider via renderer `beforeunload` / window `closed` coordination — stop session before quit when possible).

Transcript sync between windows:

- **Phase A approach:** float window is a second renderer route that receives transcript snapshots over IPC from main, relayed from the workspace renderer (`transcript:update` push). Workspace owns the session; float is display-only.
- Do not open a second Gemini session for the float window (CTL-04).

### Capture (temporary)

- Use existing `BrowserCaptureAdapter` / `getDisplayMedia` in the workspace renderer.
- Document in README and STATUS that Phase A capture is the same class as the web client; **F-05 is not satisfied**.
- Do not request or fall back to microphone (`getUserMedia` with audio-only mic). Denied mic in OS settings must not be required for Phase A demos that use tab/window share.

### Security (SEC-01 and Electron hardening)

- Permanent provider keys remain only in Go / server env; desktop ships no `GEMINI_API_KEY`.
- Renderer calls `/api/v1/capabilities` and `/api/v1/live-token` only; tokens are short-lived and not logged.
- `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload script path only.
- CSP for the local Vite/file origin: default-src self; connect-src self + `http://127.0.0.1:8080` + required Gemini WSS host(s) already used by web.
- Validate IPC payloads (boolean flags only for always-on-top; no arbitrary eval/paths).

### Dev and runtime prerequisites

- Node ≥ 20, pnpm workspace as today.
- Go API must be running for live mode (`services/api` on `:8080`), same as web.
- Windows 11 is the validation OS for Phase A shell (per requirements); Phase A does not add capture-scope claims beyond web-equivalent display media.

### Testing

| Layer | Expectation |
|---|---|
| Unit | Preload/API type smoke if practical; prefer small Node test that main IPC channel names match preload |
| Manual | Launch `dev`; open float; toggle always-on-top over another app; run a live or capture session against local API; confirm quit stops tracks |
| Automated E2E | Optional later; not required to close Phase A if manual checklist is documented |

Phase A acceptance checklist (document in `docs/feasibility/STATUS.md` when done):

- [ ] `@luma/desktop` `dev` opens workspace window without Node in DevTools console globals
- [ ] Float window opens, stays above other apps when always-on-top is on, and can be turned off
- [ ] Live/capture session works via Go token + shared packages (same failure modes as web if API down)
- [ ] No permanent provider key in desktop sources or build artifacts
- [ ] STATUS/CHECKLIST note Phase A shell done; F-05 still open until Phase B

## Phase B preview (not this plan)

- Native Windows playback capture adapter (loopback / `desktopCapturer` + session display-media handlers as needed)
- Mic-denied proof and capture-scope documentation for F-05
- Update STATUS / CHECKLIST / evidence docs

## Decisions locked

| Decision | Choice |
|---|---|
| Order | Phase A shell + float, then Phase B loopback |
| Bundler | Vite-based Electron toolchain (electron-vite preferred) |
| Capture in A | `getDisplayMedia` via existing audio package |
| Float sync | Workspace owns session; IPC snapshot to display-only float |
| Next.js in Electron | No |
| Installer | Deferred past Phase A |
