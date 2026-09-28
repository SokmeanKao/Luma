# Luma — Live Audio Translation Requirements v1.2

Date: 28 September 2026  
Status: Requirements draft for implementation; provider capabilities require a proof of concept.

Project name: **Luma**. Repository: **luma**.

## 1. Purpose

Build a personal translation companion for Microsoft Teams meetings and YouTube videos. It listens to selected playback audio and displays near-real-time translated text. The initial language pair is Korean → English. Users can select another supported source language.

The application must support a web experience and a Windows desktop experience. It must not capture or request access to the user's microphone. Teams can continue using the microphone independently.

## 2. Scope and decisions

| Item | Requirement or decision |
|---|---|
| Supported sources | Microsoft Teams in a browser and Windows desktop; YouTube browser-tab audio; other video playback sources require compatibility validation |
| Translation direction | Korean → English initially; selectable supported source language |
| Output | Live English text subtitles in the companion application |
| Input | Selected tab or Windows playback audio only; no microphone capture or video-frame analysis |
| Language filter | Translate selected-source-language speech; suppress unrelated languages |
| Web UI | Latest stable Next.js at implementation time, TypeScript; pin resolved versions |
| Typography | Maven Pro for UI and English subtitles; Korean-capable fallback for original transcripts |
| Backend | Go implementation baseline; no backend implementation is included in this handoff |
| Windows UI | Electron recommended, sharing React components and translation logic with the web app |
| AI provider | Google Gemini free tier for the prototype; exact model and text-output path must be validated |
| Billing | No automatic paid upgrade, paid model fallback, or billing enablement |
| Audience | Personal companion; subtitles are not inserted into Teams or the YouTube player, or broadcast to participants |
| Persistence | No saved audio or persistent transcript history in the MVP |

## 3. User workflow

1. Join a Teams meeting normally or open a YouTube video in Chrome/Edge.
2. Open the web translator or Windows translator.
3. Select the source language, initially Korean; target language defaults to English.
4. Click Select audio source. For web capture, choose the Teams or YouTube tab in the browser sharing dialog, enable Share tab audio, and approve sharing. For Windows capture, select the supported playback source.
5. Start translation. Show the selected source, audio activity, connection state, and elapsed session time.
6. Stream audio for processing, identify source-language speech, and display English subtitles.
7. Pause or stop at any time. Teams or YouTube continues operating normally.

For YouTube, play the video after granting capture permission. Capture continues automatically while the selected source and permission remain active; it does not require approval for every spoken segment. A normal website must not silently select a YouTube tab or bypass the browser sharing dialog. Changing the selected source requires explicit user action and browser permission where applicable. Sharing here means granting audio capture to the translator, not broadcasting the tab to meeting participants.

Teams screen sharing and translator capture are independent: translation should continue while the user presents a different window, provided the original meeting-audio source remains active. Sharing the entire screen may expose the subtitle window; sharing only the presentation window keeps it outside that shared surface.

The service must hear enough audio to identify its language. Language filtering occurs after capture; it does not mean nonmatching speech is never transmitted or never consumes quota.

## 4. Functional requirements

| ID | Requirement | Acceptance condition |
|---|---|---|
| CAP-01 | Capture browser-tab playback audio in the web version. | A Teams or YouTube tab shared with audio produces a working audio track and incoming speech is processed. |
| CAP-02 | Capture Windows playback audio in the desktop version. | Speech played by Teams reaches the translator without microphone access. |
| CAP-03 | Never request or open a microphone input. | With the microphone denied or disabled, translation of meeting playback still works; speaking locally produces no input activity when playback is silent. |
| CAP-04 | Require explicit capture selection and show capture scope. | User sees whether capture is tab-only or system audio before starting. |
| CAP-05 | Detect missing audio tracks and revoked/ended capture. | Show actionable instructions; do not remain in a misleading Listening state. |
| CAP-06 | Process only audio for translation. | Screen/tab video, if required by the capture API, is never transmitted to the AI provider or stored. |
| CAP-07 | Explain full-system capture limitations. | System mode visibly states that notifications and other applications may be included. No claim of Teams-only isolation unless verified. |
| CAP-08 | Require browser-approved tab selection. | Clicking Select audio source opens the browser chooser; cancelling sends no new audio. The app never silently discovers or starts capturing a tab. |
| CAP-09 | Continue capture after approval. | Speech is processed continuously from the selected tab until Pause, Stop, permission revocation, or source termination. Merely viewing another tab does not intentionally change the selected source. Background behavior is verified on supported browsers. |
| CAP-10 | Isolate selected-tab capture. | In tab mode, audio from another tab or local microphone is excluded; system mode is explicitly labeled as broader capture. |
| CAP-11 | Support capture during Teams screen sharing. | Presenting another window does not interrupt translation of the active Teams audio source on tested configurations. |
| VID-01 | Translate YouTube playback audio to English text. | Korean speech from the selected YouTube tab produces subtitles in the companion without relying on YouTube captions. |
| VID-02 | Handle playback pause and resume. | Pausing the video produces no new speech after in-flight results settle; resuming continues translation without a new chooser if the capture track remains active. |
| VID-03 | Handle video changes and capture termination. | Same-tab navigation is supported only where the audio track remains valid; otherwise show Source ended and require reselection. Never silently capture a different tab. |
| VID-04 | Define video limitations. | Translate audible speech only, including selected-language speech in advertisements. Do not promise ad detection, video-frame translation, media-time synchronization, protected-content capture, or reliable detection of seeking. Subtitles represent captured playback order. |
| LNG-01 | Provide source-language selection. | Korean is the default; only tested provider-supported languages are enabled. |
| LNG-02 | Filter by selected source language. | Korean speech produces English text; English-only and unrelated-language test samples produce no translated entries. |
| LNG-03 | Handle uncertain language identification. | Wait for more speech or skip uncertain segments; do not invent certainty or fabricated confidence scores. |
| LNG-04 | Handle code-switching. | Translate a predominantly Korean utterance containing English technical terms; preserve names and technical terms where appropriate. Ambiguous segments are best effort. |
| LNG-05 | Apply language changes safely. | Changing source language during capture starts a clearly marked new segment/session; old-language results are not mixed into new results. |
| TXT-01 | Display English translation incrementally when supported. | Text appears during the session without waiting for meeting completion. |
| TXT-02 | Distinguish provisional and finalized text. | Partial text may be revised in place; finalized entries are not duplicated by later partial updates. If the provider lacks explicit final markers, document the finalization rule. |
| TXT-03 | Keep text readable. | Timestamped entries, adjustable font size, automatic scrolling, and a way to inspect earlier entries without forced scrolling. |
| TXT-04 | Avoid unsupported content. | Silence does not produce invented subtitles. The app does not invent speaker names, translations, or meeting facts. |
| CTL-01 | Provide Start, Pause/Resume, Stop, and Clear. | Controls accurately reflect state. Clear removes displayed transcript; it does not stop capture unless explicitly indicated. |
| CTL-02 | Pause stops outbound audio. | Paused audio is neither sent nor queued for later upload. Resume starts with current audio. |
| CTL-03 | Stop releases resources. | Stop ends media tracks, closes the translation connection, cancels retries, and clears pending audio. No new subtitles arrive afterward. |
| CTL-04 | Maintain one active translation session per client. | Repeated Start clicks cannot create duplicate streams or duplicate quota consumption. |
| WIN-01 | Offer a compact, optionally always-on-top subtitle window. | Windows users can read subtitles beside or above Teams and turn always-on-top off. |
| ERR-01 | Handle permission, network, provider, and quota errors separately. | Explain the cause and recovery action; never imply translation is active when it is not. |
| ERR-02 | Reconnect with bounded retry and backoff. | Mark any transcript gap; never accumulate or replay unbounded stale meeting audio. Stop cancels reconnection. |

## 5. Proposed architecture

| Component | Responsibilities |
|---|---|
| Next.js web client | Settings, browser capture, audio preparation, streaming client, subtitle rendering, session controls |
| Electron Windows client | Playback capture, desktop lifecycle, floating subtitle window, shared React UI and streaming logic |
| Go backend | Keep the permanent API key server-side; validate sessions and allowed configuration; issue short-lived provider tokens; rate-limit token requests |
| Gemini integration | Streaming speech processing and translated-text delivery through a verified API configuration |

Preferred connection pattern: client requests a short-lived token from Go, then streams audio directly to Gemini using that token. The backend does not need to relay audio in this design. If the chosen model does not support this pattern, reassess the integration before implementation.

Share React components and provider logic between web and Windows. Do not assume all Next.js server features run inside Electron. Keep capture adapters separate from shared UI and translation code.

## 6. Privacy, security, and free-tier constraints

| ID | Requirement |
|---|---|
| SEC-01 | Permanent provider credentials stay on the backend; never include them in browser bundles, desktop packages, URLs, or logs. |
| SEC-02 | Use short-lived, narrowly scoped session tokens where supported. Validate source/target/model choices on the backend and limit token issuance. |
| SEC-03 | Use HTTPS/WSS outside localhost. A hosted token endpoint must have access controls; it must not be an unrestricted public key dispenser. |
| SEC-04 | Treat provider text as untrusted plain text. Do not execute returned HTML, scripts, or instructions. |
| PRI-01 | Before first capture, explain that audio is sent to Google and that the user must have permission to process meeting audio. Explain applicable free-tier data handling. |
| PRI-02 | Do not write audio to disk or store transcript content on the application server. Keep only bounded in-memory audio buffers. Provider-side retention is governed separately by provider terms. |
| PRI-03 | Do not log audio, transcript content, API keys, or temporary tokens. Operational logs may contain error categories, durations, and aggregate usage metadata. |
| COST-01 | Configure the prototype for free-tier use only. Verify project billing/model eligibility before testing; application counters alone cannot guarantee that a billing-enabled project remains free. |
| COST-02 | Stop and explain when quota is exhausted. Never silently switch to a paid service/model or repeatedly retry a quota rejection. |
| COST-03 | Show session duration. Show quota remaining only if authoritative data is available; label estimates clearly. |
| COST-04 | No guarantee of unlimited meetings or uninterrupted free-tier service. Hosting, desktop signing, and distribution are separate from AI API usage. |

## 7. Performance and compatibility

- Near real time means streaming with a measurable delay, not instantaneous translation.
- Proposed prototype target: first readable translated text within 2–5 seconds after a meaningful speech segment under normal test conditions. This is a target to measure, not a provider guarantee or release promise.
- Record first-text and finalized-text latency separately, including p50 and p95 on the agreed test set. Establish release thresholds after the proof of concept.
- Bound audio buffering; on overload, discard stale audio and visibly mark a gap instead of letting subtitles drift indefinitely behind the meeting.
- Initially validate the web client on stable Chrome and Edge on Windows. Do not claim all browsers or operating systems are supported.
- Initially validate the desktop client on a documented Windows 11 build. Additional Windows versions require separate capture testing.
- The application must not mute Teams, change its microphone selection, or inject audio into the meeting.
- Core controls must be keyboard accessible and status messages must not rely only on color.

## 8. Required feasibility checks before full implementation

| Gate | Evidence required |
|---|---|
| F-01: Translated text | Prove the selected free-tier model returns usable streaming English text from Korean audio. Speech-to-speech support alone is insufficient. Verify whether text requires output transcription or a separate transcription-plus-translation pipeline. |
| F-02: Source-language filtering | Test Korean-only, English-only, another language, mixed-language, silence, and overlapping speech. Do not assume a prompt guarantees strict filtering. If needed, use a verified language-identification stage. |
| F-03: Authentication | Verify short-lived tokens and the selected model/API configuration work together in the browser and Windows client. |
| F-04: Web capture | Demonstrate Teams and YouTube tab audio capture with microphone permission denied, selected-tab isolation, continuous capture while viewing another tab, and capture during Teams screen sharing. |
| F-05: Windows capture | Demonstrate Teams desktop playback capture with microphone permission denied; document whether capture includes other applications. |
| F-06: Quota and session limits | Record current free-tier availability, relevant limits, session expiry behavior, and supported recovery. Do not hardcode guessed quotas. |

Failure of a gate requires an explicit design adjustment. Do not claim the complete design has been validated solely from documentation or this requirements document.

## 9. End-to-end acceptance checklist

| Test | Expected result |
|---|---|
| Korean speech in Teams web | English subtitles appear in the web companion. |
| Korean YouTube speech | English subtitles appear in the companion with YouTube captions disabled. |
| Another tab plays audio | Tab capture processes only the approved tab, not the other tab. |
| User cancels source chooser | No capture starts and no new audio is sent. |
| Switch foreground tab | The approved tab remains the source while its capture track is active. |
| Pause/resume YouTube video | No fabricated text during silence; translation resumes with playback. |
| Close source tab / stop browser sharing | Capture ends, streaming stops, and UI asks for a new source. |
| Present a window in Teams | Other participants’ playback audio is still translated; no microphone capture occurs. |
| Korean speech in Teams desktop | English subtitles appear in the Windows companion. |
| Local speech while meeting playback is silent | No translator audio activity or new subtitles, provided no microphone monitoring/remote echo feeds that voice into playback. |
| Microphone permission denied | Translation still functions on both supported clients. |
| English-only meeting speech with Korean selected | No translated subtitle entry. |
| Korean sentence with an English product name | Sentence is translated, preserving the product name when appropriate. |
| Silence, music, or notification sound | No fabricated meeting speech; system capture scope remains clearly indicated. |
| Missing shared audio or denied capture | Clear recovery instructions; no active translation stream. |
| Pause, Resume, Stop | Pause sends no audio; Resume uses current audio; Stop releases capture and prevents further output. |
| Network interruption | Reconnecting state, bounded retries, visible gap, and no duplicated finalized entries. |
| Quota exhaustion | Translation stops with a free-tier limit message; no paid fallback. |
| Stop during reconnect / close application | Connections and capture resources are released; no background retry continues. |
| Thirty-minute test meeting | Measure latency drift, memory growth, quota/session interruptions, and transcript duplication; report results without assuming the free tier permits the full duration. |

## 10. Delivery phases and exclusions

1. Feasibility proof: validate all six gates using short, authorized audio samples.
2. Web MVP: source selection, Teams and YouTube tab capture, language filtering, live English subtitles, session controls, and error handling.
3. Windows MVP: desktop capture adapter, shared subtitle UI, optional floating window, installer, and documented capture scope.
4. Validation: run acceptance checks on both platforms and record known limits.

Out of scope for the MVP: Teams meeting bots; browser extensions; subtitles inserted into Teams or YouTube; on-video subtitle overlays; translation of text in video frames; translated speech playback; microphone translation; audio sent back into Teams; automatic meeting joining; speaker identity; saved recordings; persistent transcript history; billing/subscriptions. Teams-process-only Windows capture is a future enhancement unless the capture proof establishes a reliable supported implementation. Optional original-language transcripts can be added after provider support is verified.

## 11. Implementation clarifications

- Use Maven Pro (interpreting the requested “Maven” font). Self-host production fonts and preserve their licenses. Use a Korean-capable fallback such as Noto Sans KR or a tested system font; Maven Pro alone must not be assumed to cover Korean.
- The HTML mockup is a visual and interaction reference, not production code. Its example languages and simulated behavior are not evidence of provider support. Keep selected-source-language filtering mandatory in the MVP; remove the mockup option that disables it.
- Gemini documentation currently describes translated output transcription alongside generated audio. Suppressing playback does not imply audio generation or its quota usage disappears. Verify the selected model before claiming text-only operation.
- The documented target-language echo switch suppresses target-language speech; it is not a Korean-only filter. Verify reliable alignment of input-language evidence and output text, or design a distinct language-identification/transcription stage. Do not invent an unsupported sourceLanguage setting or rely on system instructions for a model that does not support them.
- Source-language filtering is a visible-output requirement, not a guarantee that other speech is never sent to Google.
- No fixed number of free minutes is promised. Inspect the project’s current model quotas and measure usage during a short authorized trial.

## 12. Reference documentation

These links guide implementation validation; the requirements do not certify current model compatibility or quotas.

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini live translation: https://ai.google.dev/gemini-api/docs/live-api/live-translate
- Gemini ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- Browser screen/audio capture: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- Electron desktop capture: https://www.electronjs.org/docs/latest/api/desktop-capturer/

## 13. Revision history

| Version | Changes |
|---|---|
| 1.0 | Initial Teams audio-only translation requirements. |
| 1.1 | Added YouTube tab audio, explicit browser sharing approval, continuous capture, source lifecycle and tab isolation tests, capture during screen sharing, and video-specific scope limits. |
| 1.2 | Adopted Luma naming, Maven Pro typography, implementation handoff, and explicit text-output/language-filter integration caveats. |
