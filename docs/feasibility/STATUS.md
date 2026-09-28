# Feasibility gates

Recorded for the Luma foundation plan. Mock/demo behavior is **not** live provider evidence.

| Gate | Status | Blocker / notes |
|---|---|---|
| F-01 Translated text | pending verification | **Blocker:** no Gemini credentials exercised in this environment. Demo mock subtitles are not live evidence. |
| F-02 Source-language filtering | pending verification | **Blocker:** live provider filter unverified. Unit/mock skip logic exists but is not provider evidence. |
| F-03 Authentication / ephemeral tokens | pending verification | **Blocker:** `POST /api/v1/live-token` returns `CONFIGURATION_MISSING` (“Live token minting is not configured”) and never fabricates a working token — even if `GEMINI_API_KEY` is set. Google mint not implemented. |
| F-04 Web capture | pending verification | **Can be tested without Gemini.** Adapter + no-mic unit guards are in place. **Remaining:** manual Chrome/Edge proof (Teams/YouTube tab audio, share-tab-audio, cancel chooser, mic denied). Not run in this session. |
| F-05 Windows capture | pending verification | **Blocker:** Electron desktop client is out of scope for the foundation plan. |
| F-06 Quota / session limits | pending verification | **Blocker:** no live quota measurement; requires credentials + AI Studio/project dashboard inspection. Capabilities endpoint intentionally omits fabricated quota fields. |
