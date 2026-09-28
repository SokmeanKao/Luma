# Electron Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a runnable `@luma/desktop` Electron app with secure main/preload, Vite React renderer reusing web live session UI, and a WIN-01 floating always-on-top subtitle window (capture still via `getDisplayMedia`).

**Architecture:** electron-vite builds main + preload + multi-page renderer (workspace + float). Preload exposes a narrow `window.lumaDesktop` bridge. Workspace owns the Gemini session; float is display-only and receives transcript snapshots over IPC. Renderer resolves `@luma/*` workspace packages and aliases `@web` → `apps/web/src` so `LiveWorkspace` and its UI deps are reused without Next.js.

**Tech Stack:** Electron 35+, electron-vite, React 19, Vite, TypeScript, pnpm workspaces, Vitest (IPC channel unit test)

## Global Constraints

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; never `webSecurity: false`
- No `GEMINI_API_KEY` or permanent provider secrets in desktop sources or build output
- API default `http://127.0.0.1:8080` via `VITE_API_BASE` / defined `NEXT_PUBLIC_API_BASE`
- Phase A capture = existing `BrowserCaptureAdapter` only; do not claim F-05 complete
- Float must not open a second translation session (CTL-04)
- Implement on branch `feat/electron-phase-a`

## File map

| Path | Responsibility |
|---|---|
| `apps/desktop/package.json` | `@luma/desktop` scripts + deps |
| `apps/desktop/electron.vite.config.ts` | main/preload/renderer + `@web` alias + React plugin |
| `apps/desktop/tsconfig.json` + `tsconfig.node.json` | TS project refs |
| `apps/desktop/src/shared/ipc.ts` | Channel names + `FloatTranscriptSnapshot` + `LumaDesktopApi` types |
| `apps/desktop/src/main/index.ts` | Windows, security prefs, IPC handlers |
| `apps/desktop/src/preload/index.ts` | `contextBridge` expose `lumaDesktop` |
| `apps/desktop/src/renderer/index.html` | Workspace entry |
| `apps/desktop/src/renderer/float.html` | Float entry |
| `apps/desktop/src/renderer/src/main.tsx` | Workspace React mount |
| `apps/desktop/src/renderer/src/float-main.tsx` | Float React mount |
| `apps/desktop/src/renderer/src/App.tsx` | Desktop chrome + LiveWorkspace + float/AOT controls + transcript publish |
| `apps/desktop/src/renderer/src/FloatApp.tsx` | Display-only subtitle UI |
| `apps/desktop/src/renderer/src/styles.css` | Tailwind + tokens + web globals essentials |
| `apps/desktop/src/renderer/src/env.d.ts` | `window.lumaDesktop` types |
| `apps/desktop/tests/ipc-channels.test.ts` | Channel name consistency |
| `docs/feasibility/STATUS.md`, `docs/CHECKLIST.md`, `README.md` | Phase A done / F-05 still open |

**LiveWorkspace reuse:** Vite alias `@web` → `../web/src`. Desktop imports `LiveWorkspace` from `@web/components/LiveWorkspace`. Define `process.env.NEXT_PUBLIC_API_BASE` in electron-vite renderer config. Extend `LiveWorkspace` with optional `onTranscriptSnapshot` and `headerExtra` — minimal web change allowed by spec.

---

### Task 1: Branch + package scaffold

**Files:**
- Create/modify: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`, `apps/desktop/tsconfig.json`, `apps/desktop/tsconfig.node.json`, `apps/desktop/src/shared/ipc.ts`
- Test: `apps/desktop/tests/ipc-channels.test.ts`

**Interfaces:**
- Produces: `IPC` channel constants + `LumaDesktopApi` / `FloatTranscriptSnapshot` in `src/shared/ipc.ts`

- [ ] **Step 1: Create branch**

```powershell
cd C:\Dev\Luma
git checkout -b feat/electron-phase-a
```

- [ ] **Step 2: Write `src/shared/ipc.ts`**

```ts
export const IPC = {
  setAlwaysOnTop: 'luma:set-always-on-top',
  getAlwaysOnTop: 'luma:get-always-on-top',
  openFloat: 'luma:open-float',
  closeFloat: 'luma:close-float',
  floatClosed: 'luma:float-closed',
  publishTranscript: 'luma:publish-transcript',
  transcriptUpdate: 'luma:transcript-update',
} as const;

export type FloatTranscriptSnapshot = {
  entries: Array<{
    id: string;
    translatedText: string;
    originalText?: string;
    final: boolean;
  }>;
  statusLabel?: string;
};

export type LumaDesktopApi = {
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getAlwaysOnTop(): Promise<boolean>;
  openFloat(): Promise<void>;
  closeFloat(): Promise<void>;
  onFloatClosed(cb: () => void): () => void;
  publishTranscript(snapshot: FloatTranscriptSnapshot): void;
  onTranscriptUpdate(cb: (snapshot: FloatTranscriptSnapshot) => void): () => void;
};
```

- [ ] **Step 3: Write channel test** (`tests/ipc-channels.test.ts`) asserting `luma:` prefix and unique values.

- [ ] **Step 4: Write `package.json`** with electron-vite, electron, react 19 matching web, workspace `@luma/*`, vitest; scripts `dev`/`build`/`preview`/`typecheck`/`test`/`lint`; `"main": "./out/main/index.js"`.

- [ ] **Step 5: Write `electron.vite.config.ts` + tsconfigs** with React plugin, `@web` alias, multipage `index.html`+`float.html`, `define` for `NEXT_PUBLIC_API_BASE`.

- [ ] **Step 6:** `pnpm install` then `pnpm --filter @luma/desktop test` — expect PASS.

- [ ] **Step 7: Commit** `chore(desktop): scaffold electron-vite package and IPC types`

---

### Task 2: Main + preload (secure shell + float window)

**Files:**
- Create: `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`
- Minimal HTML/React stubs so Electron launches

**Interfaces:**
- Produces: `window.lumaDesktop` matching `LumaDesktopApi`

- [ ] **Step 1: Implement preload** with `contextBridge.exposeInMainWorld('lumaDesktop', api)` using `IPC` channels; coerce AOT to boolean; subscribe helpers return unsubscribe.

- [ ] **Step 2: Implement main** with `securePrefs()`, workspace 1100×800, float 420×220 `alwaysOnTop: true` default, IPC handlers, forward transcript to float, quit on workspace close only.

- [ ] **Step 3: Minimal HTML stubs** so `dev` opens windows.

- [ ] **Step 4:** `pnpm --filter @luma/desktop dev` — workspace opens.

- [ ] **Step 5: Commit** `feat(desktop): secure main/preload and floating window IPC`

---

### Task 3: Renderer workspace + LiveWorkspace reuse

**Files:**
- Modify: `apps/web/src/components/LiveWorkspace.tsx` — optional `onTranscriptSnapshot`, `headerExtra`
- Create: `App.tsx`, `main.tsx`, `styles.css`, `env.d.ts`, postcss as needed

- [ ] **Step 1: Extend LiveWorkspace** with props; call snapshot callback when entries change; render `headerExtra` in header.

- [ ] **Step 2: Desktop App** wires float/AOT buttons via `lumaDesktop` and publishes snapshots.

- [ ] **Step 3: styles** — tailwind + `@luma/ui/tokens.css` + critical web globals; Maven Pro via font link in HTML.

- [ ] **Step 4: `env.d.ts`** for `window.lumaDesktop`.

- [ ] **Step 5:** typecheck web + desktop; commit `feat(desktop): wire LiveWorkspace renderer and float controls`

---

### Task 4: Float display UI

**Files:**
- Create: `FloatApp.tsx`, `float-main.tsx`, `float.html`

- [ ] **Step 1: FloatApp** — `onTranscriptUpdate`, compact Brand, scrolling translated text, drag region on header.

- [ ] **Step 2: Verify** float mirrors workspace publishes.

- [ ] **Step 3: Commit** `feat(desktop): display-only floating subtitle window`

---

### Task 5: Docs + STATUS

**Files:**
- Modify: `docs/feasibility/STATUS.md`, `docs/CHECKLIST.md`, `README.md`

- [ ] **Step 1:** Mark Phase A shell complete; F-05 still Phase B / missing native capture.

- [ ] **Step 2:** README desktop `pnpm --filter @luma/desktop dev` (requires Go API for live).

- [ ] **Step 3: Commit** `docs: mark Electron Phase A shell; F-05 still Phase B`

---

## Manual acceptance (operator)

1. Go API on `:8080`
2. `pnpm --filter @luma/desktop dev`
3. Renderer has no Node integration (`typeof require === 'undefined'`)
4. Floating subtitles + always-on-top toggle
5. Live capture session same as web
6. Closing float does not stop session

## Self-review

- Spec coverage: secure shell, Vite reuse, WIN-01 float, getDisplayMedia, Go API, SEC-01, STATUS — tasked
- Transcript IPC extends listed bridge (required by sync section)
- No installer / loopback in this plan
