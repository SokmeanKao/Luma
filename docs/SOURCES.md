# Official implementation sources

Prepared 28 September 2026. These are upstream documentation links, not vendored source code. Re-check versions and capabilities when implementing. The model selection is provisional until exercised with the user’s free-tier project.

| Area | Official source | Use / verification |
|---|---|---|
| Live translation | https://ai.google.dev/gemini-api/docs/live-api/live-translate | Translation config, output transcripts, audio format, limitations |
| Temporary credentials | https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens | Token constraints, expiry, SDK/API compatibility |
| API reference | https://ai.google.dev/api/live | Authoritative wire schemas and session events |
| JavaScript SDK source | https://github.com/googleapis/js-genai | Browser client APIs and version changes |
| Go SDK source | https://github.com/googleapis/go-genai | Backend integration; verify token creation support or use documented HTTP API |
| Pricing | https://ai.google.dev/gemini-api/docs/pricing | Model free-tier eligibility and audio/text usage |
| Rate limits | https://ai.google.dev/gemini-api/docs/rate-limits | Project-specific restrictions, not promised free minutes |
| Project quota dashboard | https://aistudio.google.com/rate-limit | User must inspect their selected project’s live limits |
| Terms | https://ai.google.dev/gemini-api/terms | Provider data handling and applicable conditions |
| Browser capture | https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia | Permission flow, audio-track availability and source lifecycle |
| Chrome capture controls | https://developer.chrome.com/docs/web-platform/screen-sharing-controls | Tab/system audio options and user source selection |
| AudioWorklet | https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet | Off-main-thread audio processing |
| AudioContext | https://developer.mozilla.org/en-US/docs/Web/API/AudioContext | Audio graph, sample rates and disposal |
| Electron capture | https://www.electronjs.org/docs/latest/api/desktop-capturer | Playback-capture implementation |
| Electron session | https://www.electronjs.org/docs/latest/api/session | Display-media permission handlers and loopback options |
| Electron security | https://www.electronjs.org/docs/latest/tutorial/security | Renderer isolation and IPC security |
| Next.js setup | https://nextjs.org/docs/app/getting-started/installation | Current supported runtime and installation |
| Next.js fonts | https://nextjs.org/docs/app/getting-started/fonts | Self-hosted font integration |
| Maven Pro family | https://fonts.google.com/specimen/Maven+Pro | Requested UI typeface |
| Maven Pro files/license | https://github.com/google/fonts/tree/main/ofl/mavenpro | Obtain font assets and preserve license |
| Korean fallback | https://fonts.google.com/noto/specimen/Noto+Sans+KR | Optional Korean font |
| pnpm workspaces | https://pnpm.io/workspaces | Shared packages |
| Go HTTP | https://pkg.go.dev/net/http | Backend server/client primitives |
| Playwright | https://playwright.dev/docs/intro | UI automation |

## Findings checked for this handoff

The live-translation guide documents audio output with optional output transcription and short-lived client tokens. Its echoTargetLanguage switch concerns target-language speech, not a selected-source allowlist. The candidate model is a translation service with restrictions different from a conversational agent. Do not substitute prompting for unsupported configuration. Use the guide’s current audio format/chunk guidance rather than guessing.

The Chrome capture documentation explains browser-managed selection; Luma must retain explicit user approval. Electron security guidance should be applied before enabling native capture. Next.js font documentation and the Maven Pro family page were checked for typography integration. Other listed sources are the authoritative starting points to verify during implementation.
