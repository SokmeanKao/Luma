# Next.js upgrade verification — foundation worktree

Date: 28 September 2026  
Branch: `feat/luma-foundation`  
Checkout: `C:\Dev\Luma`  
Scope: In-place upgrade of existing `apps/web` (not a recreate). Maven Pro, Luma UI CSS, and demo-mode foundation scope preserved. **No Tailwind** added (approved UI uses mockup CSS tokens).

## Dist-tag check

```powershell
pnpm view next dist-tags.latest
```

| Tag | Value at upgrade time |
|---|---|
| `latest` | **16.3.6** |
| `canary` | 16.4.0-canary.51 (not used) |
| `beta` | 16.0.0-beta.0 (not used) |
| `rc` | 15.0.0-rc.1 (not used) |
| `backport` | 15.5.26 (previous installed line) |

Selected: **`next@16.3.6`** from `dist-tags.latest` only.

## Exact installed versions (`@luma/web`)

| Package | Installed |
|---|---|
| `next` | **16.3.6** |
| `react` | **19.3.0** |
| `react-dom` | **19.3.0** |
| `eslint` | 9.39.5 |
| `eslint-config-next` | **16.3.6** |
| `typescript` | 5.9.3 |
| `@playwright/test` | 1.63.0 |

Pinned in `apps/web/package.json`: `"next": "16.3.6"`, `"eslint-config-next": "16.3.6"`. Lockfile: `pnpm-lock.yaml` updated.

## Tooling notes (Next 16)

- Default bundler is Turbopack (`next build` reports “Next.js 16.3.6 (Turbopack)”).
- `next lint` removed; lint script is `eslint .` with flat config importing `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Added `typecheck`: `tsc -p tsconfig.json --noEmit`.

## Verification commands and results

| Command | Result |
|---|---|
| `pnpm --filter @luma/web lint` | pass |
| `pnpm --filter @luma/web typecheck` | pass |
| `pnpm --filter @luma/web build` | pass |
| `pnpm --filter @luma/translation test` | pass (7) |
| `pnpm --filter @luma/audio test` | pass (4) |
| `pnpm exec playwright test` (apps/web, system Chrome) | pass (1) |

## Preserved foundation behavior

- Demo mode pill and Start demo flow unchanged
- Maven Pro via `next/font/google`
- Cream/green mockup styling via `@luma/ui` tokens + `globals.css`
- Go live-token stub and shared packages untouched by this upgrade
