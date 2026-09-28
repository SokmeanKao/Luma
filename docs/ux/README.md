# Luma production UX

Local screenshots under this folder are **gitignored** (`docs/ux/*.png`, etc.). Capture them on your machine when reviewing layout; do not commit binaries.

## Current workspace (web)

Compact toolbar + transcript-first stage:

- **From / To** searchable language pair + swap
- Compact **audio source** chip (label + change); empty state points at the primary CTA
- **Text** / **Text + voice** (voice requires a Chrome **Tab** with Share tab audio)
- **Audio settings** when voice-relevant (volume / ducking)
- Status uses a **listening wave** (activity-reactive) instead of a status dot
- Dual panels: original | translation; text size + clear in the transcript chrome
- **Choose audio source** auto-starts translation after the share dialog succeeds

## Preview fixtures

| State | URL |
|---|---|
| Empty | `/preview/transcript?state=empty` |
| Source ready | `/preview/transcript?state=ready` |
| Listening | `/preview/transcript?state=listening` |
| Paused | `/preview/transcript?state=paused` |
| Error | `/preview/transcript?state=error` |

Privacy label: **Playback audio only · Microphone not captured**.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @luma/web typecheck` | pass |
| Playwright workspace-states / layout | pass |
| Live YouTube → English | pending (manual) |
| Text + voice + ducking E2E | pending (tab + suppressLocalAudioPlayback) |
