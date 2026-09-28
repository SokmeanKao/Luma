# Foundation verification checklist

Date: 28 September 2026  
Checkout: `C:\Dev\Luma`  
Branch: `main` @ `844d9ad` (+ local follow-up commits if present)  
Remote: `https://github.com/SokmeanKao/Luma.git`  
Worktree migration: **complete** (`.worktrees/luma-foundation` removed)

Next.js: **16.3.6**

## Milestone (authoritative)

**Web implementation is complete enough for live validation — not all requirements are complete.**

| Area | Conclusion |
|---|---|
| Web implementation | Largely implemented |
| Docs drift, restart history, friendly errors, `providerAvailable`, capture-policy test | Fixed in a later increment; do not reopen from the earlier audit snapshot |
| Gemini | Token mint + PCM→English smoke evidence recorded |
| Real Chrome/Edge tab→translation | **Deferred / unverified** |
| Source-language filtering, voice, ducking | Implemented in code; **E2E evidence incomplete** |
| Electron desktop | **Deferred / not implemented** (Windows browser ≠ Electron app) |

Earlier audit findings that listed those doc/history/error/`providerAvailable`/capture-policy gaps are **historical**. Prefer this section and the deferred backlog below.

## Automated results

| Check | Result |
|---|---|
| `pnpm --filter @luma/translation test` | pass |
| `pnpm --filter @luma/audio test` | pass (includes capture-policy / activity / ducking units) |
| `cd services/api; go test ./...` | pass |
| `pnpm --filter @luma/web typecheck` | pass |
| Playwright workspace + transcript actions | pass (fixture `/preview/transcript`) |

## Modes

| Mode | Behavior | Claims translation? |
|---|---|---|
| Live (default) | Tab capture → PCM → Gemini when Start is pressed | Yes — real provider path |
| Capture | Display media + activity meter only | No |
| Demo (`?demo=1`) | Mock samples | No — labeled demo |

## Deferred backlog (keep unverified)

| ID | Status |
|---|---|
| F-01 browser tab E2E (YouTube/Teams → EN in UI) | **pending / unverified** |
| F-02 language-filter E2E matrix | **unverified** |
| F-04 Chrome/Edge capture matrix | **pending** |
| Voice + ducking on real suppress-capable tab | **unverified** E2E |
| F-05 Electron Windows client | **missing** (`apps/desktop` stub) |

## Requirements mapping (selected)

| ID | Status |
|---|---|
| CTL / UX compact toolbar + dual paragraphs | **implemented** (Playwright fixture) |
| CAP-03 no mic | **implemented** (display-media only + unit policy); F-04 mic-denied proof **pending** |
| CAP-04/08 chooser | **implemented**; cancel/no-audio manual **pending** F-04 |
| F-01 mint + PCM smoke EN text | **partial / verified mint+PCM**; browser tab E2E **pending** |
| F-02 language filter E2E | **unverified** (code present; matrix empty) |
| F-04 Chrome/Edge capture matrix | **pending** |
| F-05 Electron | **missing** (`apps/desktop` stub) |
| Live Teams/YouTube UI E2E | **pending** (needs human browser + free-tier) |
