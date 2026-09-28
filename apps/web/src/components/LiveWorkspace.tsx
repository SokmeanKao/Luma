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
  type TranscriptItem,
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
import {
  LanguagePairControls,
  languageName,
  loadStoredPair,
  pairAllowed,
  storePair,
  targetsForSource,
  type LanguagePair,
} from './LanguagePairControls';

function clock(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function statusCopy(
  state: SessionState,
  hasSource: boolean,
  pairOk: boolean,
): string {
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
      return hasSource
        ? pairOk
          ? 'Audio ready — not translating'
          : 'Choose a supported language pair'
        : 'Choose languages, then an audio source';
    case 'quota_exhausted':
      return 'Quota exhausted';
    case 'error':
      return 'Something went wrong';
    default:
      if (!pairOk) return 'Choose a supported language pair';
      if (hasSource) return 'Audio ready — not translating';
      return 'Choose languages, then an audio source';
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
  const [sourceLang, setSourceLang] = useState('ko');
  const [targetLang, setTargetLang] = useState('en');
  const [historyItems, setHistoryItems] = useState<TranscriptItem[]>([]);
  const [pendingPair, setPendingPair] = useState<LanguagePair | null>(null);

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
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    sourceLangRef.current = sourceLang;
    targetLangRef.current = targetLang;
  }, [sourceLang, targetLang]);

  useEffect(() => {
    void fetchCapabilities()
      .then((c) => {
        setCaps(c);
        const stored = loadStoredPair();
        const pairs = c.supportedPairs ?? [];
        let next: LanguagePair = {
          source: c.defaultSourceLanguage || 'ko',
          target: c.defaultTargetLanguage || 'en',
        };
        if (stored && pairAllowed(pairs, stored.source, stored.target)) {
          next = stored;
        } else if (!pairAllowed(pairs, next.source, next.target) && pairs[0]) {
          next = { source: pairs[0].source, target: pairs[0].target };
        }
        setSourceLang(next.source);
        setTargetLang(next.target);
        storePair(next);
      })
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

  async function closeProviderOnly() {
    providerRef.current?.pauseSending();
    await providerRef.current?.close();
    providerRef.current = null;
    sessionRef.current?.stop();
    activeGenerationRef.current = sessionRef.current?.getGenerationId() ?? activeGenerationRef.current + 1;
    activeSessionIdRef.current = null;
    reconnectingRef.current = false;
    translatingRef.current = false;
    stopPcmGraph();
    setStarting(false);
  }

  async function hardStop(updateUi: boolean) {
    await closeProviderOnly();
    releaseCapture();
    if (updateUi) {
      setErrorText(null);
      setErrorAction(null);
    }
  }

  function applyLanguagePair(next: LanguagePair) {
    setSourceLang(next.source);
    setTargetLang(next.target);
    sourceLangRef.current = next.source;
    targetLangRef.current = next.target;
    storePair(next);
  }

  function requestLanguageChange(next: LanguagePair) {
    if (next.source === sourceLang && next.target === targetLang) return;
    if (!caps || !pairAllowed(caps.supportedPairs, next.source, next.target)) {
      setErrorText('That language pair is not verified for Luma yet.');
      setErrorAction(null);
      return;
    }
    const targets = targetsForSource(caps.supportedPairs, next.source);
    if (!targets.includes(next.target)) {
      setErrorText('Target language is not available for the selected source.');
      setErrorAction(null);
      return;
    }
    const active =
      state === 'listening' ||
      state === 'paused' ||
      state === 'connecting' ||
      state === 'reconnecting' ||
      starting;
    if (active) {
      setPendingPair(next);
      return;
    }
    applyLanguagePair(next);
  }

  async function confirmLanguageRestart() {
    if (!pendingPair) return;
    const next = pendingPair;
    setPendingPair(null);

    const oldLabel = `${languageName(caps, sourceLang)} → ${languageName(caps, targetLang)}`;
    const newLabel = `${languageName(caps, next.source)} → ${languageName(caps, next.target)}`;
    const snapshot: TranscriptItem[] = entries.map((e) => ({
      kind: 'entry' as const,
      entry: {
        segmentId: `hist-${e.segmentId}-${Date.now()}`,
        timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
        originalText: e.originalText,
        translatedText: e.translatedText,
        showOriginal,
        fontSize,
        final: e.final,
        sourceLang,
        targetLang,
      },
    }));
    if (snapshot.length > 0 || historyItems.length > 0) {
      setHistoryItems((prev) => [
        ...prev,
        ...snapshot,
        { kind: 'divider', id: `div-${Date.now()}`, label: `${oldLabel} · now ${newLabel}` },
      ]);
    }

    await closeProviderOnly();
    sessionRef.current?.clear();
    setEntries([]);
    applyLanguagePair(next);
    setState('idle');
    if (streamRef.current && hasSource) {
      void startTranslation();
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
      token = await fetchLiveToken({
        sourceLanguage: sourceLangRef.current,
        targetLanguage: targetLangRef.current,
      });
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
        setMetrics(`First subtitle ~${ms} ms after connect (measured; not a guarantee).`);
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
            const next = await fetchLiveToken({
              sourceLanguage: sourceLangRef.current,
              targetLanguage: targetLangRef.current,
            });
            if (activeSessionIdRef.current !== sessionId || providerRef.current !== provider) return;
            await provider.connect(
              {
                mode: 'real',
                sourceLanguage: sourceLangRef.current,
                targetLanguage: targetLangRef.current,
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
          sourceLanguage: sourceLangRef.current,
          targetLanguage: targetLangRef.current,
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
        sourceLanguage: sourceLangRef.current,
        targetLanguage: targetLangRef.current,
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
    sourceLang,
    targetLang,
  }));

  const transcriptItems: TranscriptItem[] = [
    ...historyItems,
    ...viewEntries.map((entry) => ({ kind: 'entry' as const, entry })),
  ];

  const sessionActive =
    state === 'listening' ||
    state === 'paused' ||
    state === 'connecting' ||
    state === 'reconnecting' ||
    starting;
  const busy = sessionActive;
  const pairOk = pairAllowed(caps?.supportedPairs, sourceLang, targetLang);
  const canStart = Boolean(hasSource && pairOk && caps?.liveTestAllowed);
  const showSubtitles = hasSource || sessionActive || entries.length > 0 || historyItems.length > 0;
  const primaryLabel =
    state === 'listening'
      ? 'Pause'
      : state === 'paused'
        ? 'Resume'
        : state === 'reconnecting' || state === 'connecting' || starting
          ? 'Connecting…'
          : 'Start translation';
  // Start stays off until pair + source are ready. Pause/Resume stay usable while active.
  const primaryBlocked =
    state === 'listening' || state === 'paused'
      ? false
      : !canStart || starting || state === 'connecting' || state === 'reconnecting';
  const sourceLabelName = languageName(caps, sourceLang);
  const targetLabelName = languageName(caps, targetLang);
  const pairFilter =
    caps?.supportedPairs?.find((p) => p.source === sourceLang && p.target === targetLang)?.filterStatus ??
    caps?.languageFilterStatus ??
    'unverified';
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
        <Brand compact={showSubtitles || hasSource} />
        <PrivacyLabel />
      </header>

      <div className={stageClass}>
        <section className="setup-panel" aria-label="Translation setup">
          <h1 className="setup-title">Understand what you’re listening to</h1>
          <ol className="setup-steps">
            <li>
              <span className="setup-step-label">1. Choose languages</span>
              <LanguagePairControls
                caps={caps}
                source={sourceLang}
                target={targetLang}
                disabled={starting || state === 'connecting' || state === 'reconnecting'}
                onRequestChange={requestLanguageChange}
              />
              <p className="empty-hint">
                Confirm the pair before any audio is sent to Google. Last choice is remembered.
              </p>
            </li>
            <li>
              <span className="setup-step-label">2. Choose audio source</span>
              <SourceBar
                hasSource={hasSource}
                name={sourceLabel}
                detail={hasSource ? sourceDetail : undefined}
                busy={busy}
                onChoose={() => void selectAudioSource()}
                onChange={() => void selectAudioSource()}
              />
              <p className="empty-hint">
                Select a Teams or YouTube tab and enable “Share tab audio”. You can do this before or
                after languages.
              </p>
            </li>
            <li>
              <span className="setup-step-label">3. Start translation</span>
              <div className="setup-start-row">
                <StatusLine>{statusCopy(state, hasSource, pairOk)}</StatusLine>
                <SessionControls
                  timerLabel={sessionActive || seconds > 0 ? clock(seconds) : undefined}
                  primaryLabel={primaryLabel}
                  onPrimary={onPrimary}
                  onStop={() => void onStop()}
                  primaryDisabled={primaryBlocked}
                  stopDisabled={!busy && state !== 'error' && state !== 'quota_exhausted'}
                />
              </div>
              {!canStart && !sessionActive ? (
                <p className="empty-hint">
                  {capsError
                    ? 'Translation service is unreachable — Start stays off until the API responds.'
                    : !caps
                      ? 'Loading language options…'
                      : !pairOk
                        ? 'Pick a verified language pair to continue.'
                        : !hasSource
                          ? 'Audio is not shared yet — Start stays off until a tab is ready.'
                          : !caps.liveTestAllowed
                            ? 'Live translation is blocked until free-tier eligibility is confirmed.'
                            : 'Start is available when languages and audio are ready.'}
                </p>
              ) : hasSource && !sessionActive ? (
                <p className="empty-hint">Audio ready — not translating until you press Start.</p>
              ) : null}
            </li>
          </ol>
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
            <div className="error-banner" role="alert">
              <p>Translation service is unreachable. Start the Go API, then refresh.</p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setCapsError(null);
                  void fetchCapabilities()
                    .then((c) => {
                      setCaps(c);
                      const stored = loadStoredPair();
                      const pairs = c.supportedPairs ?? [];
                      let next: LanguagePair = {
                        source: c.defaultSourceLanguage || 'ko',
                        target: c.defaultTargetLanguage || 'en',
                      };
                      if (stored && pairAllowed(pairs, stored.source, stored.target)) {
                        next = stored;
                      } else if (!pairAllowed(pairs, next.source, next.target) && pairs[0]) {
                        next = { source: pairs[0].source, target: pairs[0].target };
                      }
                      setSourceLang(next.source);
                      setTargetLang(next.target);
                      storePair(next);
                    })
                    .catch((e) =>
                      setCapsError(e instanceof Error ? e.message : 'capabilities failed'),
                    );
                }}
              >
                Retry connection
              </button>
            </div>
          ) : null}
        </section>

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
                Show {sourceLabelName}
              </label>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                {sourceLabelName} → {targetLabelName}
              </span>
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
                setHistoryItems([]);
              }}
            >
              Clear
            </button>
          </div>
          <TranscriptPanel
            items={transcriptItems}
            fontSize={fontSize}
            empty={
              <div className="transcript-empty">
                {sessionActive
                  ? 'Listening for speech…'
                  : hasSource
                    ? 'Audio ready — press Start translation when you’re ready. Nothing is sent to Google yet.'
                    : '1) Choose languages · 2) Choose audio source · 3) Start translation'}
              </div>
            }
          />
        </section>

        <details
          className="settings-panel"
          open={settingsOpen && !sessionActive}
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
              Source-language filter for {sourceLabelName}: {pairFilter}. Provider support alone does
              not verify filtering.
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
      </div>

      {pendingPair ? (
        <div className="confirm-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="lang-restart-title"
          >
            <h2 id="lang-restart-title">Restart translation?</h2>
            <p>
              Changing languages ends the current session. Pending audio is discarded, a new token is
              minted, and late results from the old session are ignored. Existing subtitles stay above
              a language-pair divider.
            </p>
            <p>
              Switch to {languageName(caps, pendingPair.source)} → {languageName(caps, pendingPair.target)}?
            </p>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPendingPair(null)}>
                Keep current
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void confirmLanguageRestart()}>
                Restart with new languages
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
