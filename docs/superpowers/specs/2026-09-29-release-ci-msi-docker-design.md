# Release CI — MSI + Docker (git tag)

## Goal

Pushing a semver git tag `vX.Y.Z` builds:

1. **Windows MSI** for `@luma/desktop` (Electron), attached to a GitHub Release
2. **Docker image** for `services/api`, pushed to GHCR tagged `X.Y.Z`, `vX.Y.Z`, and `latest`

## Trigger

- `push` of tags matching `v*.*.*` (e.g. `v1.2.3`)
- No PR release builds (keeps secrets and Windows minutes focused)

## Versioning

| Artifact | Version source |
|---|---|
| GitHub Release name/tag | Tag as pushed (`v1.2.3`) |
| MSI / app `version` | Tag without `v` (`1.2.3`) via electron-builder `extraMetadata.version` |
| Container tags | `1.2.3`, `v1.2.3`, `latest` on `ghcr.io/<owner>/luma-api` |

## Components

### Docker (`services/api`)

- Multi-stage Dockerfile: Go 1.22 build → distroless/static or alpine runtime
- Default `BIND_ADDR=0.0.0.0:8080` (container-reachable; local MVP still uses loopback via env override)
- Secrets (`GEMINI_API_KEY`, etc.) via runtime env only — never baked into the image
- Workflow: `docker/build-push-action` → GHCR with `packages: write`

### MSI (`apps/desktop`)

- `electron-vite build` then `electron-builder --win msi` on `windows-latest`
- CI installs Node 20, pnpm, .NET SDK (for `@luma/win-audio` host)
- Bundle `luma-win-audio-host.exe` (+ deps) as `extraResources`; host resolver checks `process.resourcesPath` in packaged builds
- Unsigned MSI for now (no code-signing cert in CI)
- Upload `.msi` to the GitHub Release for that tag

### Workflow layout

Single workflow `.github/workflows/release.yml` with two jobs (`docker`, `msi`) that both run on the tag push; `msi` creates/updates the Release and uploads assets; `docker` only needs GHCR login.

## Out of scope

- Code signing / notarization
- Dockerizing Next.js web (desktop MSI is the Windows client; API is the server image)
- Auto-updating the Electron app
- Publishing to npm or Winget

## Success criteria

- Tag `v0.0.0-ci.N` (or real `vX.Y.Z`) produces a green workflow
- GHCR image pullable as `ghcr.io/<owner>/luma-api:X.Y.Z`
- GitHub Release contains a `.msi` artifact
