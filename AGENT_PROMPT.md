# Implement Luma

Implement the application described in docs/REQUIREMENTS.md. Read docs/IMPLEMENTATION.md and docs/SOURCES.md before coding. Use design/Luma_Translation_Mockup.html as the visual reference. Product name and repository name are Luma / luma. Use Maven Pro for UI text and an appropriate Korean fallback.

Use Next.js stable + TypeScript for web, Go for the backend, and Electron with a shared React UI for Windows. Resolve compatible current stable dependency versions and commit lockfiles. Follow existing repository instructions and preserve unrelated work.

First inspect the repository and produce a short implementation plan. Validate the six feasibility gates with evidence. If credentials, Windows access, or the chosen provider capability are missing, complete independent UI/backend/mock-provider work and report the specific blocked gate honestly. Do not mark a simulated test as a live provider test. Do not use paid services, enable billing, or invent free quotas.

Capture only user-approved tab/playback audio. Never request microphone input. Keep credentials server-side. Enforce selected-source-language filtering; do not confuse suppressing English with allowing only Korean. Treat provider text as data. Use short-lived provider tokens and document the limits of client-side session enforcement. Do not send video frames.

Implement in phases: feasibility, workspace/shared contracts, Go token service, web capture and provider adapter, production UI, Windows adapter, end-to-end verification. Keep demo mode explicit and separate from real mode. No silent fallback from real translation to samples.

Build meaningful tests for lifecycle races, stale callbacks, PCM conversion, source filtering, transcript assembly, errors, and cleanup. Perform manual Chrome/Edge and Windows audio tests for native capture permissions; browser automation alone cannot certify this behavior.

Deliver source, PowerShell setup commands, environment variable documentation, development/build/test commands, provider capability evidence, dependency versions, and a checklist mapping requirements to tests. State remaining limitations. Do not claim production readiness while live-audio or language-filter gates are unverified. Do not deploy or publish a public app as part of this handoff task.
