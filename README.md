# Luma — AI implementation handoff

Prepared 28 September 2026. This bundle contains requirements, complete HTML/CSS/JavaScript mockup source, architecture guidance, an agent prompt, and official reference links. It is **not a completed Next.js/Go/Electron application**.

## Start here

1. Read `docs/REQUIREMENTS.md` as the product specification.
2. Open `design/Luma_Translation_Mockup.html` in a browser. Use Start demo, Pause, Stop, source selection, Web/Windows preview, font size, and transcript controls.
3. Read `docs/IMPLEMENTATION.md` and `docs/SOURCES.md`.
4. Give `AGENT_PROMPT.md` and this entire folder to the coding agent in the intended repository.
5. Record feasibility findings before connecting real audio.

## Included files

| File | Purpose |
|---|---|
| docs/REQUIREMENTS.md | Requirements v1.2 and acceptance checks |
| docs/IMPLEMENTATION.md | Proposed structure, contracts, phases, tests, and risks |
| docs/SOURCES.md | Official implementation references and what to verify |
| design/Luma_Translation_Mockup.html | Responsive, interactive UI source with Maven Pro |
| AGENT_PROMPT.md | Ready-to-use implementation instructions |

The HTML fetches Maven Pro from Google Fonts when online; fallback fonts are used offline. Font binaries are not bundled. Production must self-host licensed fonts. The mockup captures no audio and uses no Gemini connection. No API keys or meeting recordings are included.
