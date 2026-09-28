# Local credentials setup (server-side only)

**Never paste your API key into chat, commits, client bundles, or logs.**

## File location

| File | Purpose | Commit? |
|---|---|---|
| `C:\Dev\Luma\.worktrees\luma-foundation\.env.example` | Placeholders only | Yes |
| `C:\Dev\Luma\.worktrees\luma-foundation\.env` | Your real local secrets | **No** (gitignored) |
| `C:\Dev\Luma\.worktrees\luma-foundation\services\api\.env` | Optional Go-cwd override | **No** (gitignored) |

Preferred: create **one** file at the worktree root:

```powershell
cd C:\Dev\Luma\.worktrees\luma-foundation
Copy-Item .env.example .env
notepad .env
```

The Go server loads process environment variables. From PowerShell you can also set them for a session without writing a file:

```powershell
$env:GEMINI_API_KEY = "<paste locally only>"
$env:GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"  # verify in AI Studio
$env:BIND_ADDR = "127.0.0.1:8080"
$env:ALLOWED_ORIGINS = "http://localhost:3000"
$env:ENABLE_LIVE_TOKEN_MINT = "false"
cd C:\Dev\Luma\.worktrees\luma-foundation\services\api
go run ./cmd/server
```

## Variable names

### Go API only (never `NEXT_PUBLIC_*`)

| Name | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For mint attempts | Permanent Google AI Studio / Gemini API key. Server-side only. |
| `GEMINI_MODEL` | Recommended | Model id string used in capabilities / mint config (must match free-tier eligibility you verify). |
| `ENABLE_LIVE_TOKEN_MINT` | Default `false` | When `true` **and** key present, Go may call Google’s auth_tokens endpoint. When `false`, returns `CONFIGURATION_MISSING`. |
| `BIND_ADDR` | Default `127.0.0.1:8080` | Loopback bind address. |
| `ALLOWED_ORIGINS` | Default `http://localhost:3000` | Exact Origin allowlist (comma-separated). |
| `DEMO_MODE` | Optional | Informational flag for ops; does not invent quotas. |

### Web client (public, no secrets)

| Name | Allowed values | Description |
|---|---|---|
| `NEXT_PUBLIC_LUMA_MODE` | `demo` (default) | UI default mode hint. Live remains disabled in product UI until gates pass. |
| `NEXT_PUBLIC_API_BASE` | `http://127.0.0.1:8080` | Loopback API base for token requests later. |

## Forbidden

- `NEXT_PUBLIC_GEMINI_API_KEY` or any permanent key in the web/desktop bundle
- Committing `.env`
- Logging request/response bodies that contain keys or ephemeral tokens
- Enabling billing / paid fallback automatically
- Push or deploy as part of this work

## Free-tier eligibility

Before marking F-01/F-03/F-06 verified, inspect your project in AI Studio / rate-limits dashboard and record model + limits in `docs/feasibility/`. Application flags cannot override Google billing settings.
