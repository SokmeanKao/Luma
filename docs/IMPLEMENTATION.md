# Luma implementation guide

## Architecture and repository

| Path | Responsibility |
|---|---|
| apps/web | Next.js App Router; client-side session UI and browser capture |
| apps/desktop | Electron main/preload plus a bundled React renderer; no dependency on Next.js server features |
| services/api | Go token/configuration endpoints and provider credentials |
| packages/ui | Shared React controls, subtitle list, source cards, Maven Pro styling |
| packages/translation | Session state machine, provider interfaces, transcript assembly, language gating |
| packages/audio | Capture interfaces, AudioWorklet, channel conversion, resampling, buffering |
| docs | Requirements, decisions, setup and capability evidence |

Use pnpm workspaces for JavaScript packages. Keep Go module management separate. The Electron renderer may use Vite or a verified static build; do not wrap remote web content with privileged Node access. No database is required for the local MVP. Public accounts and persistent history are out of scope.

## Data flow

Client source selection → approved playback stream → audio conversion → streaming provider → language gate and transcript assembly → English text. Go issues constrained tokens; the preferred media route is client-to-Google. No permanent provider key goes to either client.

The exact provider model/API configuration remains subject to proof of concept. The documented Live Translate candidate supplies output transcription with audio output. Discard returned audio rather than playing it in the subtitle MVP; measure its quota use. A transcript-only pipeline is an alternative decision, not an assumed equivalent. Do not claim language filtering based on asynchronous transcripts unless input/output alignment is demonstrated.

## Suggested internal contracts (application contracts, not Google API schemas)

- CaptureAdapter.start(): returns audio stream, source kind, and stop/dispose hooks. Exposes ended/error notifications. The browser adapter must be invoked from a user gesture.
- AudioEncoder: downmix channels, resample to provider format, emit bounded PCM chunks; expose reset/dispose. Verify channel count/sample rates. Do not send WebM blobs as PCM.
- TranslationProvider: connect(config, temporaryCredential), sendAudio(bytes), close(); events include transcript updates, interruptions, usage when available, and typed errors.
- TranscriptUpdate: sessionId, segmentId, revision, sourceLanguage if established, originalText when available, translatedText, final flag, capture timestamp. Missing provider identifiers must be handled through a documented adapter rule, not invented alignment.
- Session generation ID: increment on new session; reject events belonging to old generations after Stop, reconnect or source changes.

## State and cleanup

States: idle, selecting, connecting, listening, paused, reconnecting, stopped, error, quota_exhausted. Cancellation returns to idle without a connection. Denied permissions never trigger a microphone fallback. Disable source/language changes while active, or explicitly stop and create a new session. Never start two capture streams on repeated clicks.

Pause blocks audio sending and drops newly captured buffers. Stop stops every track, disconnects processing nodes, closes the AudioContext/provider connection, clears queues and timers, and prevents late callbacks from appending subtitles. Provider results can lag; distinguish video playback pause from explicit translator Pause. Limit queues by audio duration and mark gaps when discarding data. Set finite transcript retention in memory.

## Go endpoint proposal

| Endpoint | Behavior |
|---|---|
| GET /healthz | Basic health, no credentials or sensitive configuration |
| GET /api/v1/capabilities | Tested source languages, target languages, provider availability; no fabricated quota values |
| POST /api/v1/live-token | Validated source/target configuration; returns temporary credential, expiry, API version/model and allowed session configuration |

Use request size limits, strict JSON validation, deadlines, bounded retries for safe upstream operations, and generic client errors. Do not retry quota exhaustion automatically. Return structured errors such as INVALID_CONFIG, NOT_AUTHORIZED, RATE_LIMITED, PROVIDER_UNAVAILABLE, CONFIGURATION_MISSING. Token responses use Cache-Control: no-store and are never logged.

Local backend binds to loopback. Cross-origin access must use exact allowed origins; origin checks alone are not authentication. Reject unexpected origins/content types and validate Host for the chosen local deployment. Before hosted multi-user operation, implement actual access control and review CSRF/session handling. Keep hosted mode disabled without it. Do not add a public anonymous token endpoint.

Direct-to-provider sessions mean Go cannot guarantee immediate revocation, hard per-user audio limits, or one session across multiple clients simply by updating its own records. Document provider-enforced limits and use token constraints where supported. If hard centralized enforcement is later required, reassess a relay architecture.

Suggested configuration: server-only GEMINI_API_KEY, GEMINI_MODEL, allowed origins, bind address, explicit demo flag. Never prefix provider secrets with NEXT_PUBLIC_. No secrets in the desktop installer. Validate free-tier eligibility separately from configuration flags; FREE_ONLY=true cannot override Google billing settings.

## UI and typography

Preserve the mockup’s cream background, green accents, source/settings panel and large subtitle area. Use semantic labels, visible focus, accessible dialogs, keyboard controls, reduced motion and responsive layout. Keep microphone exclusion visible. Show real status and actual source scope. No invented latency/quota/accuracy indicators.

Use Maven Pro for headings, controls and English text. Example Next.js integration, subject to installed font export support:

```tsx
import { Maven_Pro } from 'next/font/google';
const maven = Maven_Pro({ subsets: ['latin'], variable: '--font-maven', display: 'swap' });
// Apply maven.variable on the root element.
```

```css
body { font-family: var(--font-maven), 'Malgun Gothic', system-ui, sans-serif; }
```

Use next/font/local if builds cannot fetch Google Fonts. Bundle licensed font files for Electron so its UI does not require a font CDN. Test Korean glyphs, long English translations, and 200% zoom. The mockup original-text toggle is optional; expose it only when supported by the selected pipeline.

## Windows security

Keep context isolation and sandboxing enabled; disable renderer Node integration. Use a narrowly scoped preload bridge and validate IPC payloads/senders. Deny arbitrary navigation and window creation. Bundle trusted renderer content; allowlist needed network destinations. Capture playback only. System loopback can include other applications; never label it Teams-only. Stop capture on window/session teardown. Only claim a working installer after a real Windows build and test.

## Phases and verification

1. Capability report: model, SDK/API versions, token compatibility, output text, language filtering, actual quotas and capture environments. No credentials in evidence.
2. Scaffold workspace and shared interfaces. Implement a deterministic mock adapter for offline development.
3. Go token service with validation, no-store responses, no secret logs, configuration and error tests.
4. Browser capture and audio encoder. Test resampling duration, clipping, channel conversion and chunk ordering. Verify no getUserMedia microphone path.
5. Provider connection and subtitle assembly. Test partial/final revisions, duplicate messages, Stop during connect, late events, expiry/reconnect and bounded buffering.
6. UI integration with Maven Pro; remove demo labels only in real mode. Keep demo accessible explicitly.
7. Electron capture and packaging. Run permission and playback tests on real Windows.
8. Execute the requirements checklist. Report pass/fail/blocked with environment and evidence. Human-reviewed Korean samples are needed for semantic accuracy; word-for-word string equality is not a translation quality metric.

Use Go tests for backend logic and a suitable TypeScript test runner for pure pipeline logic. Use Playwright for UI/state flows with the mock adapter. Native dialogs, Teams audio and protected sources require manual validation. Do not use an API key or real meeting data in automated fixtures.
