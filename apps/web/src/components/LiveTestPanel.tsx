'use client';

import { useEffect, useRef, useState } from 'react';
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
import { TranscriptList, SessionControls, type TranscriptEntryView } from '@luma/ui';
import { fetchCapabilities, fetchLiveToken, type Capabilities } from '../lib/api';

function clock(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/**
 * Development-only Live test: capture → PCM → Gemini Live Translate → English output transcripts.
 * Never substitutes demo/mock sample subtitles on failure.
 */
export function LiveTestPanel() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<TranscriptUpdate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [statusText, setStatusText] = useState('Live test · language filter unverified');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<string>('No live translation result yet.');
  const [firstSubtitleMs, setFirstSubtitleMs] = useState<number | null>(null);

  const sessionRef = useRef<ReturnType<typeof createSessionController> | null>(null);
  const providerRef = useRef<GeminiLiveProvider | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const meterRef = useRef<ActivityMeterHandle | null>(null);
  const chunkerRef = useRef<BoundedPcmChunker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessionStartedAt = useRef<number>(0);
  const firstSeen = useRef(false);
  const secondsRef = useRef(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    void fetchCapabilities()
      .then(setCaps)
      .catch((e) => setCapsError(e instanceof Error ? e.message : 'capabilities failed'));

    const session = createSessionController({
      onUpdate: () => setEntries(session.listTranscript()),
      onStateChange: setState,
    });
    sessionRef.current = session;
    return () => {
      void hardStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'listening') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  function clearAudioGraph() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    meterRef.current?.stop();
    meterRef.current = null;
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
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    chunkerRef.current?.reset();
    chunkerRef.current = null;
    setLevel(0);
  }

  async function hardStop() {
    providerRef.current?.pauseSending();
    await providerRef.current?.close();
    providerRef.current = null;
    sessionRef.current?.stop();
    clearAudioGraph();
  }

  async function onStop() {
    await hardStop();
    setStatusText('Stopped · capture and Live connection released');
    setErrorText(null);
  }

  function onPauseResume() {
    const session = sessionRef.current;
    const provider = providerRef.current;
    if (!session || !provider) return;
    if (state === 'listening') {
      session.pause();
      provider.pauseSending();
      setStatusText('Paused · no audio sent to Gemini');
      return;
    }
    if (state === 'paused') {
      session.resume();
      provider.resumeSending();
      setStatusText('Live test translating · filter unverified');
    }
  }

  async function startLive() {
    setErrorText(null);
    firstSeen.current = false;
    setFirstSubtitleMs(null);
    setEntries([]);
    setSeconds(0);
    setMetrics('Connecting…');

    if (!caps?.liveTestAllowed) {
      setErrorText(
        'Live test blocked: free-tier eligibility not confirmed or mint disabled. See missing evidence below. Demo samples will not be shown.',
      );
      return;
    }

    const session = sessionRef.current;
    if (!session) return;

    setState('connecting');
    setStatusText('Requesting temporary credential…');

    let token;
    try {
      token = await fetchLiveToken({ sourceLanguage: 'ko', targetLanguage: 'en' });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setErrorText(
        `${code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Token request failed'}. No demo fallback.`,
      );
      setState('error');
      return;
    }

    setStatusText('Opening browser capture (Share tab audio)…');
    const adapter = new BrowserCaptureAdapter();
    let capture;
    try {
      capture = await adapter.start({
        preferredSourceKind: 'tab',
        onEnded: () => {
          void (async () => {
            await hardStop();
            setStatusText('Source ended · Live session closed');
            setState('stopped');
          })();
        },
      });
    } catch (err) {
      if (err instanceof CaptureCancelledError) {
        setErrorText('Sharing cancelled. No capture and no Gemini session started.');
        setState('idle');
        return;
      }
      if (err instanceof NoAudioTrackError) {
        setErrorText(err.message);
        setState('error');
        return;
      }
      setErrorText(err instanceof Error ? err.message : 'Capture failed');
      setState('error');
      return;
    }
    stopCaptureRef.current = capture.stop;

    const provider = new GeminiLiveProvider();
    providerRef.current = provider;
    provider.on('transcript', (payload) => {
      const update = payload as TranscriptUpdate;
      if (!firstSeen.current) {
        firstSeen.current = true;
        const ms = Date.now() - sessionStartedAt.current;
        setFirstSubtitleMs(ms);
        setMetrics(`First English subtitle ~${ms} ms after session start (wall clock; not a SLA).`);
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
      else setState('error');
    });
    provider.on('usage', (payload) => {
      const u = payload as { connectMs?: number };
      if (u.connectMs != null) {
        setMetrics((m) => `${m} · setupComplete in ${u.connectMs} ms`);
      }
    });

    try {
      setStatusText('Connecting Live Translate WebSocket…');
      sessionStartedAt.current = Date.now();
      session.start({
        mode: 'real',
        sourceLanguage: 'ko',
        targetLanguage: 'en',
        sessionId: `live-test-${Date.now()}`,
      });
      await provider.connect(
        { mode: 'real', sourceLanguage: 'ko', targetLanguage: 'en', sessionId: session.getGenerationId().toString() },
        {
          token: token.temporaryCredential,
          expiresAt: token.expiresAt,
          model: token.model,
          apiVersion: token.apiVersion,
          websocketUrl: token.websocketUrl,
        },
      );
    } catch (err) {
      clearAudioGraph();
      await provider.close();
      session.stop();
      const pe = err instanceof ProviderError ? err : null;
      setErrorText(
        `${pe?.code ?? 'ERROR'}: ${err instanceof Error ? err.message : 'Connect failed'}. No demo fallback.`,
      );
      setState('error');
      return;
    }

    // PCM pipeline from playback stream (never microphone).
    const chunker = new BoundedPcmChunker({
      maxBufferedMs: 1500,
      onGap: (droppedMs) => {
        setMetrics((m) => `${m} · audio gap dropped ${Math.round(droppedMs)} ms`);
      },
    });
    chunkerRef.current = chunker;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const sourceNode = ctx.createMediaStreamSource(capture.stream);
    const processor = ctx.createScriptProcessor(4096, sourceNode.channelCount || 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (ev) => {
      if (!session.isSendingAudio()) return;
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
      for (const bytes of chunks) {
        provider.sendAudio(bytes);
      }
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    sourceNode.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    const meter = createActivityMeter(capture.stream);
    meterRef.current = meter;
    const tick = () => {
      setLevel(meter.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    setStatusText('Live test translating · echoTargetLanguage=false · Korean-only filter unverified');
    setState('listening');
  }

  const viewEntries: TranscriptEntryView[] = entries.map((e) => ({
    segmentId: e.segmentId,
    timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
    originalText: e.originalText,
    translatedText: e.translatedText,
    showOriginal: true,
    fontSize: 19,
    final: e.final,
  }));

  const active = state === 'listening' || state === 'paused' || state === 'connecting';
  const primaryLabel =
    state === 'listening' ? 'Ⅱ  Pause' : state === 'paused' ? '▶  Resume' : '▶  Start Live test';

  return (
    <div>
      <section className="card workspace" style={{ minHeight: 520 }}>
        <div className="live-head">
          <div className="status" role="status">
            <span
              className="dot"
              style={state === 'listening' ? { background: '#4b9f69', boxShadow: '0 0 0 4px #edf6eb' } : undefined}
            />
            <span>{statusText}</span>
          </div>
          <span style={{ fontSize: 12, color: '#a07835' }}>Dev Live test · not product Live</span>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div className="notice">
            <strong>Language filter status: unverified</strong>
            <code>echoTargetLanguage=false</code> only suppresses target-language (English) input echo. That is{' '}
            <em>not</em> a Korean-only allowlist. General Live availability stays disabled until F-02 evidence exists.
          </div>

          {!caps && !capsError ? <p style={{ color: 'var(--muted-foreground)' }}>Loading capabilities…</p> : null}
          {capsError ? (
            <p style={{ color: '#8a2f2f' }}>
              API unreachable ({capsError}). Start Go on 127.0.0.1:8080. No demo fallback.
            </p>
          ) : null}
          {caps && !caps.liveTestAllowed ? (
            <div className="notice" style={{ background: '#faf4e8', border: '1px solid #eee2c9' }}>
              <strong>Free-tier eligibility gate</strong>
              Live test will not send audio until this is confirmed.
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {(caps.missingEligibilityEvidence ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p style={{ marginBottom: 0, fontSize: 12 }}>
                After verifying in AI Studio, set <code>FREE_TIER_ELIGIBILITY_CONFIRMED=true</code> in{' '}
                <code>.env</code>, restart the Go API, then retry. Do not enable billing.
              </p>
            </div>
          ) : null}
          {caps?.liveTestAllowed ? (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              Model {caps.model} · mint enabled · eligibility flag set (still record F-01 evidence after a real Korean
              sample).
            </p>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Playback activity</div>
            <div
              style={{ height: 12, borderRadius: 8, background: '#e9eee7', overflow: 'hidden', border: '1px solid var(--line)' }}
              role="meter"
              aria-valuenow={Math.round(level * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: 'var(--green)' }} />
            </div>
          </div>

          {errorText ? (
            <p role="alert" style={{ color: '#8a2f2f', marginTop: 16 }}>
              {errorText}
            </p>
          ) : null}
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{metrics}</p>
          {firstSubtitleMs != null ? (
            <p style={{ fontSize: 12 }}>Measured first-subtitle latency: {firstSubtitleMs} ms</p>
          ) : null}
        </div>

        <div className="transcript" role="log" aria-live="polite" style={{ maxHeight: 280 }}>
          <TranscriptList
            entries={viewEntries}
            emptyMessage="No Live subtitles yet. Start Live test with a short Korean audio source. Failures never insert demo text."
          />
        </div>
      </section>

      <SessionControls
        timerLabel={clock(seconds)}
        primaryLabel={primaryLabel}
        onPrimary={() => {
          if (state === 'listening' || state === 'paused') onPauseResume();
          else void startLive();
        }}
        onStop={() => void onStop()}
        stopDisabled={!active && state !== 'error' && state !== 'quota_exhausted'}
      />
    </div>
  );
}
