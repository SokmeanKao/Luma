# Luma production UX

## Before (prior default UI)

Two-column workspace: left setup card (source picker, Korean/English selects, filter checkbox, long privacy notice, eligibility dump) + right transcript panel. Sidebar included **Open Dev demo**. Status showed implementation jargon (“Live · filter best-effort / unverified”, PCM metrics, activity meter bar).

## After (this change)

| Screen | File |
|---|---|
| Empty state — choose source | [after-empty-state.png](./after-empty-state.png) |
| Subtitles (dev demo samples for layout proof) | [after-subtitles-demo.png](./after-subtitles-demo.png) |

Production focus: **Choose audio source**, **Start translation** / **Pause** + **Stop**, large subtitle stage. Languages as compact **Korean → English**. Settings collapsed. Demo only at `/?demo=1`. Privacy label: **Playback audio only · Microphone off**.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @luma/web typecheck/build` | pass |
| translation / audio tests | 16 / 8 pass |
| Playwright: empty state | pass |
| Playwright: demo subtitles + screenshots | pass |
| Live YouTube → English | pending (manual; capture/Gemini unchanged) |
| Pause / scroll Jump to latest | implemented; manual browser pending |

Backend contracts unchanged.
