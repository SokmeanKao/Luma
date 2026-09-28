# Luma Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Luma monorepo and deliver a working Web MVP with an explicit demo/mock translation mode that matches the mockup UI, plus a Go token service skeleton — without claiming live Gemini or native capture success.

**Architecture:** pnpm workspaces host `apps/web` (Next.js), `packages/ui`, `packages/translation`, and `packages/audio`. `services/api` is a separate Go module that issues short-lived credentials later. Capture and provider adapters are interfaces; this plan ships a deterministic mock provider and a browser capture adapter stub that never calls `getUserMedia`. Real Gemini and Electron arrive in later plans.

**Tech Stack:** pnpm workspaces, Next.js (App Router) + TypeScript, Vitest, Go 1.22+, Playwright (smoke), Maven Pro via `next/font/google` with Korean fallback stack.

## Global Constraints

- Product name: **Luma**; repo name: **luma**.
- Never request or open microphone input (`getUserMedia` with audio for mic is forbidden).
- Permanent provider credentials stay server-side only; never `NEXT_PUBLIC_` for secrets.
- Selected-source-language filtering is mandatory; do not offer a “disable filter” control.
- Demo/mock mode must be explicit in the UI; never silently fall back from real mode to samples.
- Preserve mockup visual language: cream `--bg:#f5f7f3`, green `--green:#246849`, Maven Pro, source panel + large subtitle area.
- No database; no persistent transcript history.
- Hosted multi-user token endpoint stays disabled; local API binds to loopback.
- Do not invent free-tier quotas, latency metrics, or unverified provider capabilities.
- Record feasibility gates **individually** in `docs/feasibility/STATUS.md`. Credentials block provider tests (F-01–F-03, F-06). Browser capture (F-04) can be exercised without Gemini. Untested gates are **pending verification** with concrete blockers named. Do not mark a simulated test as a live provider test.
- The live-token stub must return a clear **not configured** / `CONFIGURATION_MISSING` response — **never** a fabricated working token (even if an API key env var is present).
- Commit on feature branch `feat/luma-foundation` in the worktree. Do not push or deploy.
- Prefer TDD for pure pipeline logic; use Go tests for API validation.

## File structure (this plan)

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | Workspace root |
| `apps/web/` | Next.js App Router client UI |
| `packages/ui/` | Shared React controls + styles |
| `packages/translation/` | Session state machine, provider interfaces, mock adapter, transcript assembly |
| `packages/audio/` | Capture/encoder interfaces + browser capture adapter (no mic) |
| `services/api/` | Go health, capabilities, live-token endpoints |
| `docs/feasibility/STATUS.md` | Gate status (blocked/pass) with honest evidence notes |
| `.env.example` | Documented env vars (no secrets) |

---

### Task 1: Initialize git and pnpm monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.npmrc`, `README.md` (replace handoff-only content with setup commands; keep links to docs)
- Create: `apps/web/package.json`, `packages/ui/package.json`, `packages/translation/package.json`, `packages/audio/package.json`
- Create: `docs/feasibility/STATUS.md`

**Interfaces:**
- Consumes: none
- Produces: workspace scripts `dev`, `build`, `test`, `lint`; package names `@luma/ui`, `@luma/translation`, `@luma/audio`, `@luma/web`

- [ ] **Step 1: Initialize git repository on branch `main`, then create feature branch**

```powershell
cd c:\Dev\Luma
git init
git checkout -b main
git add AGENT_PROMPT.md README.md design docs
git commit -m "chore: import Luma handoff docs and mockup"
git checkout -b feat/luma-foundation
```

- [ ] **Step 2: Add root workspace files**

`package.json`:
```json
{
  "name": "luma",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "pnpm --filter @luma/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=20"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.gitignore`:
```
node_modules
.dist
dist
.next
.turbo
coverage
.env
.env.local
*.log
.DS_Store
.worktrees
```

`.npmrc`:
```
strict-peer-dependencies=false
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: Create package stubs**

Each package `package.json` must include `"name"`, `"version": "0.0.0"`, `"private": true`, `"type": "module"`, and placeholder scripts `"build": "tsc -p tsconfig.json"`, `"test": "vitest run"`, `"lint": "tsc -p tsconfig.json --noEmit"` where applicable. `@luma/web` will be created fully in Task 5; for now create minimal `apps/web/package.json` with name `@luma/web` and `"scripts": { "dev": "echo pending", "build": "echo pending", "test": "echo pending", "lint": "echo pending" }`.

- [ ] **Step 4: Write feasibility status stub**

`docs/feasibility/STATUS.md` — record each gate individually. Use statuses `pending verification` or `blocked` with a concrete blocker. Example starting point (update honestly as work proceeds):
```markdown
# Feasibility gates

| Gate | Status | Blocker / notes |
|---|---|---|
| F-01 Translated text | pending verification | Blocker: no Gemini credentials exercised; mock demo is not live evidence |
| F-02 Source-language filtering | pending verification | Blocker: live filter unverified; mock skip logic is not provider evidence |
| F-03 Authentication / ephemeral tokens | pending verification | Blocker: live-token returns CONFIGURATION_MISSING / not configured; no Google mint |
| F-04 Web capture | pending verification | Can be tested without Gemini; manual Chrome/Edge getDisplayMedia proof still required |
| F-05 Windows capture | pending verification | Blocker: Electron out of scope for foundation plan |
| F-06 Quota / session limits | pending verification | Blocker: no live quota measurement without credentials/project dashboard |
```

- [ ] **Step 5: Commit**

```powershell
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .npmrc apps packages docs/feasibility README.md
git commit -m "chore: scaffold pnpm monorepo and feasibility status"
```

---

### Task 2: Shared translation contracts, state machine, and mock provider

**Files:**
- Create: `packages/translation/package.json`, `packages/translation/tsconfig.json`, `packages/translation/vitest.config.ts`
- Create: `packages/translation/src/types.ts`, `packages/translation/src/session.ts`, `packages/translation/src/mock-provider.ts`, `packages/translation/src/transcript.ts`, `packages/translation/src/index.ts`
- Create: `packages/translation/src/session.test.ts`, `packages/translation/src/transcript.test.ts`, `packages/translation/src/mock-provider.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `SessionState = 'idle' | 'selecting' | 'connecting' | 'listening' | 'paused' | 'reconnecting' | 'stopped' | 'error' | 'quota_exhausted'`
  - `TranscriptUpdate { sessionId, segmentId, revision, sourceLanguage?: string, originalText?: string, translatedText: string, final: boolean, captureTimestamp: number }`
  - `TranslationProvider { connect(config, temporaryCredential): Promise<void>; sendAudio(bytes: Uint8Array): void; close(): Promise<void>; on(event, handler) }`
  - `createSessionController(opts)` with `start`, `pause`, `resume`, `stop`, `clear`, `getState`, `getGenerationId`, generation rejection of stale events
  - `MockTranslationProvider` emitting fixed Korean→English sample pairs on a timer when “audio” is sent (or on `startDemo()`)

- [ ] **Step 1: Write failing tests for generation ID and transcript assembly**

```ts
// packages/translation/src/session.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from './session';

describe('createSessionController', () => {
  it('increments generation on stop and rejects stale transcript events', () => {
    const onUpdate = vi.fn();
    const session = createSessionController({ onUpdate, onStateChange: vi.fn() });
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' });
    const gen = session.getGenerationId();
    session.stop();
    session.acceptTranscript({
      sessionId: 's1',
      segmentId: 'a',
      revision: 1,
      translatedText: 'stale',
      final: true,
      captureTimestamp: Date.now(),
      generationId: gen,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(session.getState()).toBe('stopped');
  });

  it('pause does not accept outbound-audio intent (isSendingAudio false)', () => {
    const session = createSessionController({ onUpdate: vi.fn(), onStateChange: vi.fn() });
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' });
    session.pause();
    expect(session.getState()).toBe('paused');
    expect(session.isSendingAudio()).toBe(false);
  });
});
```

```ts
// packages/translation/src/transcript.test.ts
import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from './transcript';

describe('TranscriptAssembler', () => {
  it('revises partial text in place and does not duplicate finals', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({ sessionId: 's', segmentId: '1', revision: 1, translatedText: 'Hel', final: false, captureTimestamp: 1 });
    a.apply({ sessionId: 's', segmentId: '1', revision: 2, translatedText: 'Hello', final: true, captureTimestamp: 2 });
    a.apply({ sessionId: 's', segmentId: '1', revision: 3, translatedText: 'Hello again', final: false, captureTimestamp: 3 });
    const entries = a.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.translatedText).toBe('Hello');
    expect(entries[0]?.final).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @luma/translation test`
Expected: FAIL (modules missing)

- [ ] **Step 3: Implement types, assembler, session controller, mock provider**

Implement exactly:
- Reject updates whose `generationId` !== current generation after stop/reconnect.
- `clear()` clears assembler only; does not change capture/provider unless documented (matches CTL-01).
- Mock provider exposes `startDemo()` / timer; when language is `ko`, emit the mockup sample pairs; for non-tested languages still emit only if listed as demo in UI later — package itself only enables `ko` by default in `SUPPORTED_SOURCE_LANGUAGES = ['ko']`.
- Language filter helper: `shouldDisplayTranslation({ selectedSource: 'ko', detectedSource?: string })` returns false when `detectedSource` is present and !== selected; returns true when detection is unknown (wait/skip is session policy — mock marks English-only samples with `detectedSource: 'en'` and skips display).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @luma/translation test`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add packages/translation
git commit -m "feat(translation): session controller, transcript assembly, mock provider"
```

---

### Task 3: Audio package interfaces and browser capture adapter (no microphone)

**Files:**
- Create: `packages/audio/package.json`, `packages/audio/tsconfig.json`, `packages/audio/vitest.config.ts`
- Create: `packages/audio/src/types.ts`, `packages/audio/src/encoder.ts`, `packages/audio/src/browser-capture.ts`, `packages/audio/src/index.ts`
- Create: `packages/audio/src/encoder.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `CaptureAdapter.start(): Promise<{ stream: MediaStream; sourceKind: 'tab' | 'system'; stop: () => void }>` plus ended/error callbacks
  - `BrowserCaptureAdapter` uses `getDisplayMedia({ video: true, audio: true })` only; **never** `getUserMedia`
  - `AudioEncoder` downmix + resample stubs with pure functions testable on Float32Array fixtures
  - On user cancel of chooser: throw `CaptureCancelledError`; do not leave tracks open

- [ ] **Step 1: Write failing encoder tests**

```ts
import { describe, expect, it } from 'vitest';
import { downmixToMono, pcmChunkDurationMs } from './encoder';

describe('encoder', () => {
  it('downmixes stereo by averaging channels', () => {
    const mono = downmixToMono(new Float32Array([1, -1, 0.5, -0.5]), 2);
    expect(Array.from(mono)).toEqual([0, 0]);
  });

  it('reports chunk duration from sample count and rate', () => {
    expect(pcmChunkDurationMs(16000, 16000)).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @luma/audio test`
Expected: FAIL

- [ ] **Step 3: Implement encoder helpers and BrowserCaptureAdapter**

`browser-capture.ts` must:
- Document that it must be called from a user gesture.
- Call only `navigator.mediaDevices.getDisplayMedia`.
- If resulting stream has no audio track, stop video tracks and throw `NoAudioTrackError` with recovery message.
- Wire `track.onended` to notify caller.
- Export a constant `NEVER_USES_MICROPHONE = true` for tests/docs.

Add test asserting source file text does not contain `getUserMedia` (simple string scan in vitest reading the module source, or a dedicated `browser-capture.guard.test.ts` that imports a `captureApisUsed()` returning `['getDisplayMedia']` only).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add packages/audio
git commit -m "feat(audio): encoder helpers and display-media capture adapter"
```

---

### Task 4: Go token service (health, capabilities, live-token stub)

**Files:**
- Create: `services/api/go.mod`, `services/api/cmd/server/main.go`, `services/api/internal/config/config.go`, `services/api/internal/httpapi/server.go`, `services/api/internal/httpapi/handlers.go`, `services/api/internal/httpapi/handlers_test.go`
- Create: `.env.example` (repo root)

**Interfaces:**
- Consumes: env `GEMINI_API_KEY` (optional for health), `GEMINI_MODEL`, `ALLOWED_ORIGINS`, `BIND_ADDR` (default `127.0.0.1:8080`), `DEMO_MODE`
- Produces:
  - `GET /healthz` → `{"ok":true}` no secrets
  - `GET /api/v1/capabilities` → tested languages only (`ko`→`en`), `providerAvailable` false until token mint verified
  - `POST /api/v1/live-token` → validates JSON body `{ "sourceLanguage": "ko", "targetLanguage": "en" }`; always returns a clear **not configured** response with error code `CONFIGURATION_MISSING` (HTTP 503 or 501 — pick one and test it). Message must state live token minting is not configured. **Never** return a fabricated working token, temporary credential, or success payload — even if `GEMINI_API_KEY` is set. Use `Cache-Control: no-store`. Do not log keys or token-like values.

- [ ] **Step 1: Write Go handler tests**

```go
func TestHealthz(t *testing.T) { /* GET /healthz status 200, body ok, no key fields */ }
func TestCapabilities_NoFabricatedQuota(t *testing.T) { /* response must not contain invented remainingMinutes */ }
func TestLiveToken_InvalidLanguage(t *testing.T) { /* 400 INVALID_CONFIG */ }
func TestLiveToken_NotConfigured(t *testing.T) { /* always CONFIGURATION_MISSING / not configured; never 200 with a token */ }
func TestLiveToken_NoFabricatedTokenEvenWithKey(t *testing.T) { /* with GEMINI_API_KEY set in test config, still not configured; response has no credential field */ }
func TestLiveToken_NoStoreHeader(t *testing.T) { /* Cache-Control: no-store on response */ }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd services/api && go test ./...`

- [ ] **Step 3: Implement server with origin allowlist, JSON limits, loopback bind**

- Reject disallowed `Origin` on API routes (exact match list).
- Request body size limit 64 KiB.
- Structured errors: `INVALID_CONFIG`, `NOT_AUTHORIZED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `CONFIGURATION_MISSING`.
- Never log `Authorization` headers, API keys, or token values.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add services/api .env.example
git commit -m "feat(api): Go health, capabilities, and live-token stub"
```

---

### Task 5: Shared UI package + Next.js web app wired to mock session

**Files:**
- Create: `packages/ui/src/*` (Brand, SourceCard, SessionControls, TranscriptList, StatusPill, tokens.css)
- Create: `apps/web/` Next.js App Router app with Maven Pro, main live translation page matching mockup structure
- Create: `apps/web/playwright.config.ts` + one smoke test with mock mode
- Modify: root `README.md` with PowerShell setup commands

**Interfaces:**
- Consumes: `@luma/translation` session controller + mock provider; `@luma/audio` types (capture button calls adapter only in `mode=real`, which stays disabled/labeled until F-04)
- Produces: Web UI at `/` with explicit **Interactive demo** pill when `NEXT_PUBLIC_LUMA_MODE=demo` (default)

- [ ] **Step 1: Implement `@luma/ui` presentational components** using CSS variables from mockup (`--ink`, `--muted`, `--line`, `--green`, `--bg`). No cards-as-decoration beyond mockup structure (preserve mockup). Filter checkbox always checked and disabled.

- [ ] **Step 2: Scaffold Next.js app**

Use current stable `create-next-app` defaults with TypeScript, App Router, ESLint, no Tailwind unless already chosen — prefer CSS modules / global CSS matching mockup to avoid redesign.

```powershell
pnpm --filter @luma/web exec -- echo "create app files manually if create-next-app conflicts with workspace"
```

Pin resolved Next.js version in lockfile after install.

Font setup:
```tsx
import { Maven_Pro } from 'next/font/google';
const maven = Maven_Pro({ subsets: ['latin'], variable: '--font-maven', display: 'swap' });
```

- [ ] **Step 3: Wire page to demo session**

Controls: Select source (dialog explaining real chooser vs demo), Start/Pause/Resume/Stop/Clear, font size, original toggle (optional; only show original when mock provides `originalText`), timer, status text.
Default CTA: **Start demo**. Real Start remains hidden or disabled with “Live translation unavailable until feasibility gates pass.”

- [ ] **Step 4: Install deps and run unit + smoke tests**

```powershell
pnpm install
pnpm --filter @luma/translation test
pnpm --filter @luma/audio test
pnpm --filter @luma/web build
```

Playwright: open `/`, click Start demo, expect at least one English subtitle node within 6s.

- [ ] **Step 5: Update README with setup**

```markdown
## Development (PowerShell)
pnpm install
pnpm dev
cd services/api; go run ./cmd/server
```

Document `.env.example` variables.

- [ ] **Step 6: Commit**

```powershell
git add apps/web packages/ui pnpm-lock.yaml README.md
git commit -m "feat(web): demo-mode live translation UI on Next.js"
```

---

### Task 6: Foundation verification checklist

**Files:**
- Create: `docs/CHECKLIST.md` mapping CAP/CTL requirements to mock vs blocked
- Modify: `docs/feasibility/STATUS.md` if any local evidence changed (likely still blocked)

- [ ] **Step 1: Run full verification**

```powershell
pnpm test
pnpm --filter @luma/web build
cd c:\Dev\Luma\services\api; go test ./...
```

- [ ] **Step 2: Fill checklist** with pass/fail/blocked for foundation scope; mark live capture and Gemini as blocked.

- [ ] **Step 3: Commit**

```powershell
git add docs/CHECKLIST.md docs/feasibility
git commit -m "docs: foundation verification checklist and gate status"
```

---

## Later plans (not in this file)

- **Plan 2 — Live Gemini:** F-01–F-03 evidence, ephemeral token minting, browser provider adapter, discard returned audio, language-filter validation.
- **Plan 3 — Web capture E2E:** F-04 manual Chrome/Edge evidence, encoder worklet, reconnect/backoff.
- **Plan 4 — Electron Windows:** F-05, secure preload, playback capture, floating window.

## Spec coverage (self-review)

| Area | Covered in this plan? |
|---|---|
| Monorepo + shared contracts | Yes (Tasks 1–3) |
| Go token service baseline | Yes (Task 4, mint deferred honestly) |
| Mock UI / demo mode | Yes (Task 5) |
| No microphone | Yes (Task 3 guard) |
| Live Gemini text / filter / quota | Blocked, documented |
| Electron / Windows capture | Deferred to Plan 4 |
| Playwright full acceptance | Smoke only; native dialogs manual |

## Placeholder scan

No TBD steps; live-token stub always returns `CONFIGURATION_MISSING` / not configured — never a fabricated token.)
