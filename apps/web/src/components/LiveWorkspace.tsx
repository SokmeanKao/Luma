'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Brand,
  SessionControls,
  SourceCard,
  StatusPill,
  TranscriptList,
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
      return 'Select a tab in the browser dialog…';
    case 'connecting':
      return 'Connecting';
    case 'listening':
      return 'Listening';
    case 'paused':
      return 'Paused';
    case 'reconnecting':
      return 'Reconnecting';
    case 'stopped':
      return 'Session stopped';
    case 'quota_exhausted':
      return 'Quota exhausted';
    case 'error':
      return 'Error';
    default:
      return hasSource ? 'Ready · source selected' : 'Ready · select a browser tab with audio';
  }
}

/**
 * Primary Luma web app: native tab picker → PCM → Gemini → English subtitles.
 * Never falls back to demo samples on failure.
 */
export function LiveWorkspace({ onOpenDemo }: { onOpenDemo: () => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<TranscriptUpdate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('No source selected');
  const [sourceDetail, setSourceDetail] = useState('Browser tab · Share tab audio required');
  const [sourceKind, setSourceKind] = useState<'tab' | 'system' | null>(null);
  const [hasSource, setHasSource] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [fontSize, setFontSize] = useState(19);
  const [metrics, setMetrics] = useState('Waiting for a real Korean speech sample.');
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
    setSourceKind(null);
    setSourceLabel('No source selected');
    setSourceDetail('Browser tab · Share tab audio required');
  }

  async function hardStop(updateUi: boolean) {
    providerRef.current?.pauseSending();
    await providerRef.current?.close();
    providerRef.current = null;
    sessionRef.current?.stop();
    releaseCapture();
    translatingRef.current = false;
    setStarting(false);
    if (updateUi) {
      setErrorText(null);
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
    if (starting || state === 'listening' || state === 'paused' || state === 'connecting') {
      setErrorText('Stop the active session before selecting a new source.');
      return;
    }
    setErrorText(null);
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
                ? 'Source ended. Capture and translation stopped. Select a tab again to continue.'
                : 'Source ended. Select a tab again to continue.',
            );
          })();
        },
      });

      streamRef.current = result.stream;
      stopCaptureRef.current = result.stop;
      setHasSource(true);
      setSourceKind(result.sourceKind);
      setSourceLabel(result.label);
      setSourceDetail(
        result.sourceKind === 'system'
          ? 'System / screen capture · other apps may be included · microphone not captured'
          : `Tab capture${result.displaySurface ? ` · ${result.displaySurface}` : ''} · microphone not captured`,
      );
      startActivityMeter(result.stream);
      setState('idle');
    } catch (err) {
      releaseCapture();
      if (err instanceof CaptureCancelledError) {
        setErrorText('Sharing cancelled. No capture started.');
        setState('idle');
        return;
      }
      if (err instanceof NoAudioTrackError) {
        setErrorText(err.message);
        setState('error');
        return;
      }
      setErrorText(err instanceof Error ? err.message : 'Could not open the browser sharing dialog.');
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
      setErrorText('Select an audio source first (browser sharing dialog).');
      return;
    }
    if (!caps?.liveTestAllowed) {
      setErrorText(
        'Live translation blocked until free-tier eligibility is confirmed in .env (FREE_TIER_ELIGIBILITY_CONFIRMED=true) and the Go API is restarted. Demo samples will not be shown.',
      );
      return;
    }

    setStarting(true);
    setErrorText(null);
    firstSeen.current = false;
    setFirstSubtitleMs(null);
    setEntries([]);
    setSeconds(0);
    setMetrics('Requesting temporary credential…');
    setState('connecting');

    let token;
    try {
      token = await fetchLiveToken();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setErrorText(`${code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Token failed'}. No demo fallback.`);
      setState('error');
      setStarting(false);
      return;
    }

    const provider = new GeminiLiveProvider();
    providerRef.current = provider;
    provider.on('transcript', (payload) => {
      const update = payload as TranscriptUpdate;
      if (!firstSeen.current && update.translatedText.trim()) {
        firstSeen.current = true;
        const ms = Date.now() - sessionStartedAt.current;
        setFirstSubtitleMs(ms);
        setMetrics(`First English subtitle ~${ms} ms after connect (measured; not a guarantee).`);
      }
      session.acceptTranscript({
        ...update,
        captureTimestamp: secondsRef.current * 1000,
        generationId: session.getGenerationId(),
      });
    });
    provider.on('error', (payload) => {
      const err = payload as ProviderError;
      setErrorText(`${err.code}: ${err.message}. No demo fallback.`);
      if (err.code === 'QUOTA_EXHAUSTED') setState('quota_exhausted');
      else if (session.getState() !== 'stopped') setState('error');
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
          sessionId: `luma-${Date.now()}`,
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
        sessionId: `luma-${Date.now()}`,
      });
      attachPcmPipeline(stream, provider);
      translatingRef.current = true;
      setMetrics((m) => `${m} · streaming PCM`);
    } catch (err) {
      stopPcmGraph();
      await provider.close();
      providerRef.current = null;
      session.stop();
      const pe = err instanceof ProviderError ? err : null;
      setErrorText(
        `${pe?.code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Connect failed'}. No demo fallback.`,
      );
      setState('error');
    } finally {
      setStarting(false);
    }
  }

  function onPrimary() {
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
  }

  const viewEntries: TranscriptEntryView[] = entries.map((e) => ({
    segmentId: e.segmentId,
    timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
    originalText: e.originalText,
    translatedText: e.translatedText,
    showOriginal,
    fontSize,
  }));

  const busy = state === 'listening' || state === 'paused' || state === 'connecting' || starting;
  const primaryLabel =
    state === 'listening' ? 'Ⅱ  Pause' : state === 'paused' ? '▶  Resume' : '▶  Start translation';

  return (
    <div className="app">
      <aside>
        <Brand />
        <div className="nav">◉ &nbsp; Live translation</div>
        <div className="side-note">
          <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>Microphone not captured.</div>
          Translate selected tab playback.
          <br />
          Keep your conversation flowing.
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
          <button type="button" className="btn" style={{ width: '100%', fontSize: 12 }} onClick={onOpenDemo}>
            Open Dev demo (samples only)
          </button>
        </div>
      </aside>
      <main>
        <div className="top">
          <span>Workspace / Live translation</span>
          <StatusPill demo={false}>Live · filter best-effort / unverified</StatusPill>
        </div>
        <div className="heading">
          <div>
            <h1>Every word, a little clearer.</h1>
            <p>Select a YouTube or Teams tab, then start English subtitles.</p>
          </div>
        </div>

        <div className="grid">
          <section className="card settings">
            <div className="eyebrow">SET UP YOUR SESSION</div>
            <h2>What are you listening to?</h2>
            <SourceCard
              name={sourceLabel}
              detail={sourceDetail}
              icon={sourceKind === 'system' ? '▣' : sourceKind ? '▶' : '?'}
            />
            <button
              type="button"
              className="btn wide"
              disabled={busy}
              onClick={() => void selectAudioSource()}
            >
              ↗ &nbsp; Select audio source
            </button>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
              Opens your browser’s sharing dialog. Choose a Teams or YouTube tab and enable{' '}
              <strong>Share tab audio</strong>. This is not a simulated picker.
            </p>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '24px 0' }} />
            <label className="field" htmlFor="language">
              Translate from
            </label>
            <select id="language" className="field-control" disabled value="ko">
              <option value="ko">Korean</option>
            </select>
            <div style={{ textAlign: 'center', color: '#9ba69d', margin: 8 }}>↓</div>
            <label className="field" htmlFor="target">
              Translate into
            </label>
            <select id="target" className="field-control" disabled value="en">
              <option value="en">English</option>
            </select>
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12, marginTop: 19 }}>
              <input type="checkbox" checked disabled readOnly />
              <span>
                Only show selected-language results when detection is available
                <br />
                <span style={{ color: 'var(--muted)' }}>
                  Filter status: {caps?.languageFilterStatus ?? 'unverified'}. Not a guarantee of Korean-only.
                </span>
              </span>
            </label>
            <div className="notice">
              <strong>◌ &nbsp; Playback audio only</strong>
              Microphone is never requested. Video frames are never sent to Gemini. Discarding translated audio does not
              prove zero audio-generation quota use.
            </div>
            {capsError ? (
              <p style={{ color: '#8a2f2f', fontSize: 12 }}>API: {capsError}</p>
            ) : null}
            {caps && !caps.liveTestAllowed ? (
              <div className="notice" style={{ background: '#faf4e8', border: '1px solid #eee2c9' }}>
                <strong>Free-tier gate</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {(caps.missingEligibilityEvidence ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <div>
            <section className={`card workspace${state === 'listening' ? ' running' : ''}`}>
              <div className="live-head">
                <div className="status" role="status">
                  <span className="dot" />
                  <span>{statusCopy(state, hasSource)}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)', alignItems: 'center' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={showOriginal}
                      onChange={(e) => setShowOriginal(e.target.checked)}
                    />{' '}
                    Original
                  </label>
                  <button
                    type="button"
                    className="btn"
                    style={{ border: 0, background: 'none', padding: 5 }}
                    onClick={() => setFontSize((f) => (f >= 25 ? 17 : f + 2))}
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ border: 0, background: 'none', padding: 5 }}
                    onClick={() => {
                      sessionRef.current?.clear();
                      setEntries([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ padding: '12px 24px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                  Audio activity · {Math.round(level * 100)}%
                </div>
                <div
                  style={{
                    height: 10,
                    borderRadius: 8,
                    background: '#e9eee7',
                    overflow: 'hidden',
                    border: '1px solid var(--line)',
                  }}
                  role="meter"
                  aria-valuenow={Math.round(level * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: 'var(--green)' }} />
                </div>
                {errorText ? (
                  <p role="alert" style={{ color: '#8a2f2f', fontSize: 13 }}>
                    {errorText}
                  </p>
                ) : null}
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>{metrics}</p>
                {firstSubtitleMs != null ? (
                  <p style={{ fontSize: 12 }}>Measured first subtitle: {firstSubtitleMs} ms</p>
                ) : null}
              </div>
              <div className="transcript" role="log" aria-live="polite">
                <TranscriptList
                  entries={viewEntries}
                  emptyMessage="No live subtitles yet. Select a tab with Korean speech, then Start translation."
                />
              </div>
              <div className="foot">
                <span>Korean → English · live transcripts</span>
                <div className="wave" aria-hidden>
                  <i /><i /><i /><i /><i /><i /><i /><i /><i />
                </div>
              </div>
            </section>
            <SessionControls
              timerLabel={clock(seconds)}
              hint={
                state === 'listening'
                  ? '· Sending playback PCM'
                  : state === 'paused'
                    ? '· Outbound audio stopped'
                    : hasSource
                      ? '· Source ready'
                      : '· Select a source first'
              }
              primaryLabel={primaryLabel}
              onPrimary={onPrimary}
              onStop={() => void onStop()}
              stopDisabled={!busy && state !== 'error' && state !== 'quota_exhausted'}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
