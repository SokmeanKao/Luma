'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Brand,
  PrivacyLabel,
  SessionControls,
  SourceBar,
  StatusLine,
  TranscriptPanel,
  type TranscriptEntryView,
} from '@luma/ui';
import {
  BrowserCaptureAdapter,
  BoundedPcmChunker,
  CaptureCancelledError,
  NoAudioTrackError,
  createActivityMeter,
  type ActivityMeterHandle,
} from '@luma/audio';
import {
  GeminiLiveProvider,
  ProviderError,
  createSessionController,
  type SessionState,
  type TranscriptUpdate,
} from '@luma/translation';
import { fetchCapabilities, fetchLiveToken, type Capabilities } from '../lib/api';

function clock(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function statusCopy(state: SessionState, hasSource: boolean): string {
  switch (state) {
    case 'selecting':
      return 'Choose a source';
    case 'connecting':
      return 'Connecting';
    case 'listening':
      return 'Listening';
    case 'paused':
      return 'Paused';
    case 'reconnecting':
      return 'Connecting';
    case 'stopped':
      return hasSource ? 'Ready' : 'Choose a source';
    case 'quota_exhausted':
      return 'Quota exhausted';
    case 'error':
      return 'Something went wrong';
    default:
      return hasSource ? 'Ready' : 'Choose a source';
  }
}

type ErrorAction = 'choose-source' | 'retry' | null;

/**
 * Primary Luma web app: native tab picker → PCM → Gemini → English subtitles.
 * Never falls back to demo samples on failure.
 */
export function LiveWorkspace() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<TranscriptUpdate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<ErrorAction>(null);
  const [sourceLabel, setSourceLabel] = useState('No source selected');
  const [sourceDetail, setSourceDetail] = useState('Browser tab · Share tab audio required');
  const [hasSource, setHasSource] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [metrics, setMetrics] = useState('');
  const [firstSubtitleMs, setFirstSubtitleMs] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const sessionRef = useRef<ReturnType<typeof createSessionController> | null>(null);
  const providerRef = useRef<GeminiLiveProvider | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const meterRef = useRef<ActivityMeterHandle | null>(null);
  const chunkerRef = useRef<BoundedPcmChunker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessionStartedAt = useRef(0);
  const firstSeen = useRef(false);
  const secondsRef = useRef(0);
  const translatingRef = useRef(false);
  const activeGenerationRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  const reconnectingRef = useRef(false);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    void fetchCapabilities()
      .then(setCaps)
      .catch((e) => setCapsError(e instanceof Error ? e.message : 'capabilities failed'));

    const session = createSessionController({
      onUpdate: () => setEntries(session.listTranscript()),
      onStateChange: (s) => {
        setState(s);
        translatingRef.current = s === 'listening';
      },
    });
    sessionRef.current = session;
    return () => {
      void hardStop(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'listening') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  function stopMeterLoop() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    meterRef.current?.stop();
    meterRef.current = null;
    setLevel(0);
  }

  function stopPcmGraph() {
    try {
      processorRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    chunkerRef.current?.reset();
    chunkerRef.current = null;
  }

  function releaseCapture() {
    stopMeterLoop();
    stopPcmGraph();
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    streamRef.current = null;
    setHasSource(false);
    setSourceLabel('No source selected');
    setSourceDetail('Browser tab · Share tab audio required');
  }

  async function hardStop(updateUi: boolean) {
    providerRef.current?.pauseSending();
    await providerRef.current?.close();
    providerRef.current = null;
    sessionRef.current?.stop();
    activeGenerationRef.current = sessionRef.current?.getGenerationId() ?? activeGenerationRef.current + 1;
    activeSessionIdRef.current = null;
    reconnectingRef.current = false;
    releaseCapture();
    translatingRef.current = false;
    setStarting(false);
    if (updateUi) {
      setErrorText(null);
      setErrorAction(null);
    }
  }

  function startActivityMeter(stream: MediaStream) {
    stopMeterLoop();
    const meter = createActivityMeter(stream);
    meterRef.current = meter;
    const tick = () => {
      setLevel(meter.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function selectAudioSource() {
    if (starting || state === 'listening' || state === 'paused' || state === 'connecting' || state === 'reconnecting') {
      setErrorText('Stop the active session before choosing a new source.');
      setErrorAction(null);
      return;
    }
    setErrorText(null);
    setErrorAction(null);
    setState('selecting');

    // Replace any prior capture first.
    stopMeterLoop();
    stopPcmGraph();
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    streamRef.current = null;

    const adapter = new BrowserCaptureAdapter();
    try {
      const result = await adapter.start({
        preferredSourceKind: 'tab',
        onEnded: () => {
          void (async () => {
            const wasTranslating = translatingRef.current;
            await hardStop(false);
            setState('stopped');
            setErrorText(
              wasTranslating
                ? 'The shared tab closed. Translation stopped.'
                : 'The shared tab closed.',
            );
            setErrorAction('choose-source');
          })();
        },
      });

      streamRef.current = result.stream;
      stopCaptureRef.current = result.stop;
      setHasSource(true);
      setSourceLabel(result.label);
      setSourceDetail(
        result.sourceKind === 'system'
          ? 'Screen or window · other apps may be included'
          : 'Browser tab · Share tab audio',
      );
      startActivityMeter(result.stream);
      setSettingsOpen(false);
      setState('idle');
    } catch (err) {
      releaseCapture();
      if (err instanceof CaptureCancelledError) {
        setErrorText('Sharing was cancelled. Nothing was captured.');
        setErrorAction('choose-source');
        setState('idle');
        return;
      }
      if (err instanceof NoAudioTrackError) {
        setErrorText('No tab audio was shared. Choose the tab again and enable “Share tab audio”.');
        setErrorAction('choose-source');
        setState('error');
        return;
      }
      setErrorText(err instanceof Error ? err.message : 'Could not open the browser sharing dialog.');
      setErrorAction('choose-source');
      setState('error');
    }
  }

  function attachPcmPipeline(stream: MediaStream, provider: GeminiLiveProvider) {
    stopPcmGraph();
    const chunker = new BoundedPcmChunker({
      maxBufferedMs: 1500,
      onGap: (droppedMs) => {
        setMetrics((m) => `${m} · gap ${Math.round(droppedMs)} ms`);
      },
    });
    chunkerRef.current = chunker;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const sourceNode = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, sourceNode.channelCount || 1, 1);
    processorRef.current = processor;
    const mute = ctx.createGain();
    mute.gain.value = 0;

    processor.onaudioprocess = (ev) => {
      if (!sessionRef.current?.isSendingAudio()) {
        // Pause: drop newly captured buffers (do not queue for later).
        return;
      }
      const input = ev.inputBuffer;
      const channels = input.numberOfChannels;
      const frames = input.length;
      const interleaved = new Float32Array(frames * channels);
      for (let c = 0; c < channels; c += 1) {
        const data = input.getChannelData(c);
        for (let i = 0; i < frames; i += 1) {
          interleaved[i * channels + c] = data[i] ?? 0;
        }
      }
      const chunks = chunker.pushFloat(interleaved, channels, input.sampleRate);
      for (const bytes of chunks) provider.sendAudio(bytes);
    };

    sourceNode.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  }

  async function startTranslation() {
    if (starting) return;
    const session = sessionRef.current;
    const stream = streamRef.current;
    if (!session) return;

    if (!stream || !hasSource) {
      setErrorText('Choose an audio source first.');
      setErrorAction('choose-source');
      return;
    }
    if (!caps?.liveTestAllowed) {
      setErrorText(
        'Live translation isn’t available yet. Confirm free-tier eligibility in .env, then restart the API.',
      );
      setErrorAction(null);
      return;
    }

    setStarting(true);
    setErrorText(null);
    setErrorAction(null);
    firstSeen.current = false;
    setFirstSubtitleMs(null);
    setEntries([]);
    setSeconds(0);
    setMetrics('Requesting temporary credential…');
    setSettingsOpen(false);
    setState('connecting');

    let token;
    try {
      token = await fetchLiveToken();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setErrorText(`${code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Could not start a secure session.'}`);
      setErrorAction('retry');
      setState('error');
      setStarting(false);
      return;
    }

    const sessionId = `luma-${Date.now()}`;
    activeSessionIdRef.current = sessionId;
    const provider = new GeminiLiveProvider();
    providerRef.current = provider;
    provider.on('transcript', (payload) => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      const update = payload as TranscriptUpdate;
      if (!firstSeen.current && update.translatedText.trim()) {
        firstSeen.current = true;
        const ms = Date.now() - sessionStartedAt.current;
        setFirstSubtitleMs(ms);
        setMetrics(`First English subtitle ~${ms} ms after connect (measured; not a guarantee).`);
      }
      session.acceptTranscript({
        ...update,
        sessionId,
        captureTimestamp: secondsRef.current * 1000,
        generationId: activeGenerationRef.current,
      });
    });
    provider.on('error', (payload) => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      const err = payload as ProviderError;
      if (err.code === 'QUOTA_EXHAUSTED') {
        translatingRef.current = false;
        provider.pauseSending();
        setErrorText('Translation quota is used up for now. Try again later.');
        setErrorAction(null);
        setState('quota_exhausted');
        return;
      }
      if (err.code === 'SESSION_EXPIRED' || err.code === 'NETWORK') {
        if (reconnectingRef.current) {
          translatingRef.current = false;
          setErrorText('The connection dropped and could not be restored.');
          setErrorAction('retry');
          setState('error');
          return;
        }
        reconnectingRef.current = true;
        setState('reconnecting');
        setMetrics((m) => `${m} · transcript gap (connection dropped)`);
        setErrorText(null);
        setErrorAction(null);
        void (async () => {
          try {
            provider.pauseSending();
            await provider.close();
            const next = await fetchLiveToken();
            if (activeSessionIdRef.current !== sessionId || providerRef.current !== provider) return;
            await provider.connect(
              {
                mode: 'real',
                sourceLanguage: 'ko',
                targetLanguage: 'en',
                sessionId,
              },
              {
                token: next.temporaryCredential,
                expiresAt: next.expiresAt,
                model: next.model,
                apiVersion: next.apiVersion,
                websocketUrl: next.websocketUrl,
                targetLanguageCode: next.targetLanguageCode,
                echoTargetLanguage: next.echoTargetLanguage,
                setupLocked: next.setupLocked,
              },
            );
            if (activeSessionIdRef.current !== sessionId || providerRef.current !== provider) {
              await provider.close();
              return;
            }
            reconnectingRef.current = false;
            setErrorText(null);
            setErrorAction(null);
            setMetrics((m) => `${m} · reconnected (gap already marked)`);
            if (session.getState() === 'paused') {
              provider.pauseSending();
              setState('paused');
            } else {
              setState('listening');
              translatingRef.current = true;
            }
          } catch (reconnectErr) {
            if (activeSessionIdRef.current !== sessionId) return;
            translatingRef.current = false;
            setErrorText(
              `Could not reconnect: ${reconnectErr instanceof Error ? reconnectErr.message : 'unknown error'}.`,
            );
            setErrorAction('retry');
            setState('error');
          }
        })();
        return;
      }
      setErrorText(`${err.code}: ${err.message}`);
      setErrorAction('retry');
      if (session.getState() !== 'stopped') setState('error');
    });

    try {
      setMetrics('Opening Gemini Live Translate session…');
      sessionStartedAt.current = Date.now();
      setState('connecting');
      await provider.connect(
        {
          mode: 'real',
          sourceLanguage: 'ko',
          targetLanguage: 'en',
          sessionId,
        },
        {
          token: token.temporaryCredential,
          expiresAt: token.expiresAt,
          model: token.model,
          apiVersion: token.apiVersion,
          websocketUrl: token.websocketUrl,
          targetLanguageCode: token.targetLanguageCode,
          echoTargetLanguage: token.echoTargetLanguage,
          setupLocked: token.setupLocked,
        },
      );
      session.start({
        mode: 'real',
        sourceLanguage: 'ko',
        targetLanguage: 'en',
        sessionId,
      });
      activeGenerationRef.current = session.getGenerationId();
      reconnectingRef.current = false;
      attachPcmPipeline(stream, provider);
      translatingRef.current = true;
      setMetrics((m) => `${m} · streaming PCM`);
    } catch (err) {
      stopPcmGraph();
      await provider.close();
      if (providerRef.current === provider) providerRef.current = null;
      session.stop();
      activeGenerationRef.current = session.getGenerationId();
      activeSessionIdRef.current = null;
      const pe = err instanceof ProviderError ? err : null;
      setErrorText(
        `${pe?.code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Could not connect.'}`,
      );
      setErrorAction('retry');
      setState('error');
    } finally {
      setStarting(false);
    }
  }

  function onPrimary() {
    if (state === 'reconnecting' || starting) return;
    if (state === 'listening') {
      sessionRef.current?.pause();
      providerRef.current?.pauseSending();
      return;
    }
    if (state === 'paused') {
      sessionRef.current?.resume();
      providerRef.current?.resumeSending();
      return;
    }
    void startTranslation();
  }

  async function onStop() {
    await hardStop(true);
    setState('stopped');
    setSettingsOpen(true);
  }

  function onErrorAction() {
    if (errorAction === 'choose-source') {
      setErrorText(null);
      setErrorAction(null);
      void selectAudioSource();
      return;
    }
    if (errorAction === 'retry') {
      setErrorText(null);
      setErrorAction(null);
      void startTranslation();
    }
  }

  const viewEntries: TranscriptEntryView[] = entries.map((e) => ({
    segmentId: e.segmentId,
    timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
    originalText: e.originalText,
    translatedText: e.translatedText,
    showOriginal,
    fontSize,
    final: e.final,
  }));

  const sessionActive =
    state === 'listening' ||
    state === 'paused' ||
    state === 'connecting' ||
    state === 'reconnecting' ||
    starting;
  const busy = sessionActive;
  const showWorkspace = hasSource || sessionActive || entries.length > 0 || state === 'error' || state === 'quota_exhausted';
  const primaryLabel =
    state === 'listening'
      ? 'Pause'
      : state === 'paused'
        ? 'Resume'
        : state === 'reconnecting' || state === 'connecting' || starting
          ? 'Connecting…'
          : 'Start translation';
  const primaryDisabled =
    starting ||
    state === 'connecting' ||
    state === 'reconnecting' ||
    (!hasSource && state !== 'listening' && state !== 'paused');
  const stageClass = [
    'stage',
    state === 'listening' ? 'is-listening is-active' : '',
    state === 'paused' ? 'is-paused is-active' : '',
    state === 'connecting' || state === 'reconnecting' ? 'is-active' : '',
    state === 'error' ? 'is-error' : '',
    state === 'quota_exhausted' ? 'is-quota' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand compact={showWorkspace} />
        <PrivacyLabel />
      </header>

      <div className={stageClass}>
        {!showWorkspace ? (
          <section className="empty-state" aria-labelledby="empty-title">
            <h1 id="empty-title">Understand what you’re listening to</h1>
            <p>Choose a Teams or YouTube tab to translate its speech into English.</p>
            <SourceBar
              hasSource={false}
              name=""
              busy={busy}
              onChoose={() => void selectAudioSource()}
              onChange={() => void selectAudioSource()}
            />
            <p className="empty-hint">
              Select the tab and enable “Share tab audio” in your browser.
            </p>
            {caps && !caps.liveTestAllowed ? (
              <div className="gate-note">
                Live translation opens after free-tier eligibility is confirmed.
                <ul>
                  {(caps.missingEligibilityEvidence ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {capsError ? (
              <p className="empty-hint" role="status">
                Translation service is unreachable. Start the Go API, then refresh.
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <div className="toolbar">
              <div className="lang-chip" aria-label="Translation languages">
                Korean <span aria-hidden>→</span> English
              </div>
              <StatusLine>{statusCopy(state, hasSource)}</StatusLine>
            </div>

            <SourceBar
              hasSource={hasSource}
              name={sourceLabel}
              detail={hasSource ? sourceDetail : undefined}
              busy={busy}
              onChoose={() => void selectAudioSource()}
              onChange={() => void selectAudioSource()}
            />

            {errorText ? (
              <div className="error-banner" role="alert">
                <p>{errorText}</p>
                {errorAction === 'choose-source' ? (
                  <button type="button" className="btn btn-ghost" onClick={onErrorAction}>
                    Choose source again
                  </button>
                ) : null}
                {errorAction === 'retry' ? (
                  <button type="button" className="btn btn-ghost" onClick={onErrorAction}>
                    Retry connection
                  </button>
                ) : null}
              </div>
            ) : null}

            <section className="subtitle-stage" aria-label="Subtitles">
              <div className="subtitle-stage-head">
                <div className="subtitle-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={showOriginal}
                      onChange={(e) => setShowOriginal(e.target.checked)}
                    />
                    Show Korean
                  </label>
                  {hasSource ? (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }} aria-live="off">
                      Audio {Math.round(level * 100)}%
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    sessionRef.current?.clear();
                    setEntries([]);
                  }}
                >
                  Clear
                </button>
              </div>
              <TranscriptPanel
                entries={viewEntries}
                fontSize={fontSize}
                empty={
                  <div className="transcript-empty">
                    {hasSource
                      ? 'Press Start translation when you’re ready.'
                      : 'Choose an audio source to begin.'}
                  </div>
                }
              />
            </section>

            <SessionControls
              timerLabel={sessionActive || seconds > 0 ? clock(seconds) : undefined}
              primaryLabel={primaryLabel}
              onPrimary={onPrimary}
              onStop={() => void onStop()}
              primaryDisabled={primaryDisabled}
              stopDisabled={!busy && state !== 'error' && state !== 'quota_exhausted'}
            />

            <details
              className="settings-panel"
              open={settingsOpen}
              onToggle={(e) => setSettingsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>
                Settings
                <span aria-hidden>{settingsOpen ? '▴' : '▾'}</span>
              </summary>
              <div className="settings-body">
                <label>
                  Subtitle size
                  <input
                    type="range"
                    min={16}
                    max={28}
                    step={1}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    aria-valuetext={`${fontSize} pixels`}
                  />
                </label>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  Language filter: {caps?.languageFilterStatus ?? 'unverified'} (best-effort when the
                  provider reports a source language).
                </p>
                {firstSubtitleMs != null ? (
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    First subtitle measured at {firstSubtitleMs} ms
                    {metrics ? ` · ${metrics}` : ''}
                  </p>
                ) : metrics ? (
                  <p style={{ margin: 0, color: 'var(--muted)' }}>{metrics}</p>
                ) : null}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
