# Local credentials setup (server-side only)

**Never paste your API key into chat, commits, client bundles, or logs.**

## File location

| File | Purpose | Commit? |
|---|---|---|
| `C:\Dev\Luma\.env.example` | Placeholders only | Yes |
| `C:\Dev\Luma\.env` | Your real local secrets | **No** (gitignored) |
| `C:\Dev\Luma\services\api\.env` | Optional Go-cwd override | **No** (gitignored) |

Preferred: create **one** file at the worktree root:

```powershell
cd C:\Dev\Luma
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
cd C:\Dev\Luma\services\api
go run ./cmd/server
```

## Variable names

### Go API only (never `NEXT_PUBLIC_*`)

| Name | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For mint attempts | Permanent Google AI Studio / Gemini API key. Server-side only. |
| `GEMINI_MODEL` | Recommended | Model id string used in capabilities / mint config (must match free-tier eligibility you verify). |
| `ENABLE_LIVE_TOKEN_MINT` | Default `false` | When `true` **and** key present, Go may mint ephemeral tokens. |
| `FREE_TIER_ELIGIBILITY_CONFIRMED` | Default `false` | Must be `true` only after you verify free-tier model availability in AI Studio / rate limits. Live test refuses mint/audio otherwise. |
| `TARGET_LANGUAGE_CODE` | Default `en` | Locked into ephemeral token translation constraints. |
| `BIND_ADDR` | Default `127.0.0.1:8080` | Loopback bind address. |
| `ALLOWED_ORIGINS` | Default `http://localhost:3000,http://127.0.0.1:3000` | Exact Origin allowlist (comma-separated). Include both hostnames if you open either URL. |
| `DEMO_MODE` | Optional | Ops flag (`true`/`false`). Informational for Go; does not invent quotas. Set `false` for real translation runs. |
| `NEXT_PUBLIC_LUMA_MODE` | `live` \| `capture` \| `demo` | Public UI mode. **`live`** (and `capture`) open the real capture→Gemini workspace. **`demo`** opens sample subtitles only. Invalid values fall back to `live`. |
| `NEXT_PUBLIC_API_BASE` | `http://127.0.0.1:8080` | Loopback API base (plain URL text). |

## Forbidden

- `NEXT_PUBLIC_GEMINI_API_KEY` or any permanent key in the web/desktop bundle
- Committing `.env`
- Logging request/response bodies that contain keys or ephemeral tokens
- Enabling billing / paid fallback automatically
- Push or deploy as part of this work

## Free-tier eligibility

Before marking F-01/F-03/F-06 verified, inspect your project in AI Studio / rate-limits dashboard and record model + limits in `docs/feasibility/`. Application flags cannot override Google billing settings.
