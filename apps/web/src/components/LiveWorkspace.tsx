'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AudioLinesIcon,
  EraserIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from 'lucide-react';
import {
  Brand,
  PrivacyLabel,
  SessionControls,
  StatusLine,
  DualTranscriptPanel,
  type TranscriptEntryView,
  type TranscriptItem,
} from '@luma/ui';
import {
  BrowserCaptureAdapter,
  CaptureCancelledError,
  NoAudioTrackError,
  createActivityMeter,
  createOriginalAudioMonitor,
  createTranslatedAudioPlayer,
  parseProviderPcmMime,
  pcm16leHasSignal,
  type ActivityMeterHandle,
  type OriginalAudioMonitor,
  type TranslatedAudioPlayer,
} from '@luma/audio';
import {
  GeminiLiveProvider,
  ProviderError,
  createSessionController,
  createTranslatedAudioOutputGate,
  groupTranscriptParagraphs,
  type SessionState,
  type TranscriptUpdate,
  type TranslatedAudioChunk,
  type TranslatedAudioOutputGate,
} from '@luma/translation';
import { fetchCapabilities, fetchLiveToken, type Capabilities } from '../lib/api';
import { effectivePairs } from '../lib/language-catalog';
import { AudioSettingsDialog } from './AudioSettingsDialog';
import { StatusIndicator, statusToneFromState } from './StatusIndicator';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
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
      return 'Reconnecting';
    case 'stopped':
      return hasSource
        ? pairOk
          ? 'Audio ready — not translating'
          : 'Choose a supported language pair'
        : 'Choose languages and an audio source';
    case 'quota_exhausted':
      return 'Quota exhausted';
    case 'error':
      return 'Something went wrong';
    default:
      if (!pairOk) return 'Choose a supported language pair';
      if (hasSource) return 'Audio ready — not translating';
      return 'Choose languages and an audio source';
  }
}

type ErrorAction = 'choose-source' | 'retry' | null;
type OutputMode = 'text' | 'text-voice';

type VoiceDiag = {
  received: number;
  released: number;
  discarded: number;
  queued: number;
  played: number;
  silentPcm: number;
  badMime: number;
  ctx: string;
  gate: string;
  lastDiscard?: string;
};

function emptyVoiceDiag(): VoiceDiag {
  return {
    received: 0,
    released: 0,
    discarded: 0,
    queued: 0,
    played: 0,
    silentPcm: 0,
    badMime: 0,
    ctx: 'none',
    gate: 'pending',
  };
}

function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ProviderError) {
    switch (err.code) {
      case 'QUOTA_EXHAUSTED':
        return 'Translation quota is used up for now. Try again later.';
      case 'RATE_LIMITED':
        return 'The translation service is busy. Wait a moment, then retry.';
      case 'NOT_AUTHORIZED':
        return 'This session isn’t authorized. Restart the API and try again.';
      case 'CONFIGURATION_MISSING':
        return 'Live translation isn’t configured yet. Check API settings and free-tier eligibility.';
      case 'SESSION_EXPIRED':
        return 'The translation session ended. Start again to continue.';
      case 'NETWORK':
      case 'PROVIDER_UNAVAILABLE':
        return 'Could not reach the translation service. Check your connection and try again.';
      default:
        return err.message?.trim() || fallback;
    }
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === 'CONFIGURATION_MISSING' || code === 'NOT_CONFIGURED') {
    return 'Live translation isn’t configured yet. Check API settings and free-tier eligibility.';
  }
  if (code === 'QUOTA_EXHAUSTED' || code === 'RATE_LIMITED') {
    return code === 'QUOTA_EXHAUSTED'
      ? 'Translation quota is used up for now. Try again later.'
      : 'The translation service is busy. Wait a moment, then retry.';
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

/**
 * Primary Luma web app: native tab picker → PCM → Gemini → English subtitles (+ optional voice).
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
  const [voicePlaybackSafe, setVoicePlaybackSafe] = useState(false);
  const [canDuckOriginal, setCanDuckOriginal] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [, setMetrics] = useState('');
  const [, setFirstSubtitleMs] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [sourceLang, setSourceLang] = useState('ko');
  const [targetLang, setTargetLang] = useState('en');
  const [historyItems, setHistoryItems] = useState<TranscriptItem[]>([]);
  const [pendingPair, setPendingPair] = useState<LanguagePair | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>('text');
  const [voiceVolume, setVoiceVolume] = useState(0.85);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [duckOriginal, setDuckOriginal] = useState(true);
  const [duckLevel, setDuckLevel] = useState(0.2);
  const [voiceGapNote, setVoiceGapNote] = useState<string | null>(null);
  const [, setVoiceDiag] = useState<VoiceDiag>(() => emptyVoiceDiag());

  const sessionRef = useRef<ReturnType<typeof createSessionController> | null>(null);
  const providerRef = useRef<GeminiLiveProvider | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const meterRef = useRef<ActivityMeterHandle | null>(null);
  const monitorRef = useRef<OriginalAudioMonitor | null>(null);
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
  const voiceSafeRef = useRef(false);
  const canDuckRef = useRef(false);
  const outputModeRef = useRef<OutputMode>('text');
  const playerRef = useRef<TranslatedAudioPlayer | null>(null);
  const gateRef = useRef<TranslatedAudioOutputGate | null>(null);
  const voiceDiagRef = useRef<VoiceDiag>(emptyVoiceDiag());
  const duckOriginalRef = useRef(true);
  const voiceMutedRef = useRef(false);
  const translationPlayingRef = useRef(false);

  function syncMonitorDuckFromPlayback() {
    monitorRef.current?.setTranslationPlaying(
      translationPlayingRef.current && !voiceMutedRef.current,
    );
  }

  function bumpVoiceDiag(patch: Partial<VoiceDiag> & { lastDiscard?: string }) {
    voiceDiagRef.current = { ...voiceDiagRef.current, ...patch };
    setVoiceDiag({ ...voiceDiagRef.current });
  }

  function noteVoiceDiscard(reason: string) {
    voiceDiagRef.current.discarded += 1;
    voiceDiagRef.current.lastDiscard = reason;
    bumpVoiceDiag({
      discarded: voiceDiagRef.current.discarded,
      lastDiscard: reason,
      gate: gateRef.current?.getDecision() ?? 'pending',
      ctx: playerRef.current?.getContextState() ?? 'none',
      queued: playerRef.current?.getQueuedCount() ?? 0,
      played: playerRef.current?.getPlayedCount() ?? 0,
    });
    if (typeof console !== 'undefined') {
      console.info('[luma:voice]', {
        received: voiceDiagRef.current.received,
        released: voiceDiagRef.current.released,
        discarded: voiceDiagRef.current.discarded,
        reason,
        gate: gateRef.current?.getDecision(),
        ctx: playerRef.current?.getContextState(),
      });
    }
  }

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    sourceLangRef.current = sourceLang;
    targetLangRef.current = targetLang;
    gateRef.current?.setSelectedSource(sourceLang);
  }, [sourceLang, targetLang]);

  useEffect(() => {
    outputModeRef.current = outputMode;
    const wantVoice = outputMode === 'text-voice' && voiceSafeRef.current;
    playerRef.current?.setEnabled(wantVoice);
  }, [outputMode]);

  useEffect(() => {
    playerRef.current?.setVolume(voiceVolume);
  }, [voiceVolume]);

  useEffect(() => {
    voiceMutedRef.current = voiceMuted;
    playerRef.current?.setMuted(voiceMuted);
    // Muted translation should not leave the original ducked underneath silence.
    syncMonitorDuckFromPlayback();
  }, [voiceMuted]);

  useEffect(() => {
    monitorRef.current?.setVolume(originalVolume);
  }, [originalVolume]);

  useEffect(() => {
    duckOriginalRef.current = duckOriginal;
    monitorRef.current?.setDuckEnabled(duckOriginal && canDuckOriginal);
  }, [duckOriginal, canDuckOriginal]);

  useEffect(() => {
    monitorRef.current?.setDuckRatio(duckLevel);
  }, [duckLevel]);

  useEffect(() => {
    const player = createTranslatedAudioPlayer({
      maxQueuedMs: 4000,
      onGap: (reason) => {
        setVoiceGapNote(
          reason === 'playback_queue_overflow'
            ? 'Translated voice skipped ahead to stay in sync.'
            : null,
        );
        noteVoiceDiscard(reason);
      },
      onPlayingChange: (playing) => {
        translationPlayingRef.current = playing;
        syncMonitorDuckFromPlayback();
      },
    });
    playerRef.current = player;
    const gate = createTranslatedAudioOutputGate({
      pendingTimeoutMs: 2000,
      maxPendingMs: 3000,
      onPlay: (chunk) => {
        if (outputModeRef.current !== 'text-voice' || !voiceSafeRef.current) {
          noteVoiceDiscard('voice_mode_off');
          return;
        }
        voiceDiagRef.current.released += 1;
        player.enqueue(chunk);
        bumpVoiceDiag({
          released: voiceDiagRef.current.released,
          queued: player.getQueuedCount(),
          played: player.getPlayedCount(),
          ctx: player.getContextState(),
          gate: gateRef.current?.getDecision() ?? 'play',
        });
      },
      onDiscard: (reason) => noteVoiceDiscard(reason),
    });
    gate.setSelectedSource(sourceLangRef.current);
    gateRef.current = gate;
    return () => {
      void player.close();
      gate.reset();
      playerRef.current = null;
      gateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flushTranslatedVoice(reason: string, opts?: { resetGate?: boolean }) {
    playerRef.current?.flush(reason);
    if (opts?.resetGate !== false) {
      gateRef.current?.noteInterrupted();
    }
  }

  function syncVoiceEnabled() {
    const want = outputModeRef.current === 'text-voice' && voiceSafeRef.current;
    playerRef.current?.setEnabled(want);
    bumpVoiceDiag({
      ctx: playerRef.current?.getContextState() ?? 'none',
      gate: gateRef.current?.getDecision() ?? 'pending',
      queued: playerRef.current?.getQueuedCount() ?? 0,
      played: playerRef.current?.getPlayedCount() ?? 0,
    });
  }

  useEffect(() => {
    void fetchCapabilities()
      .then((c) => {
        setCaps(c);
        const stored = loadStoredPair();
        const pairs = effectivePairs(c.supportedPairs, c.languages, c.allDistinctPairsAllowed);
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
    monitorRef.current?.setTranslationPlaying(false);
    monitorRef.current?.detach();
  }

  function releaseCapture() {
    stopMeterLoop();
    stopPcmGraph();
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    streamRef.current = null;
    setHasSource(false);
    setVoicePlaybackSafe(false);
    setCanDuckOriginal(false);
    voiceSafeRef.current = false;
    canDuckRef.current = false;
    if (outputModeRef.current === 'text-voice') {
      setOutputMode('text');
      outputModeRef.current = 'text';
    }
    syncVoiceEnabled();
    setSourceLabel('No source selected');
    setSourceDetail('Browser tab · Share tab audio required');
  }

  async function closeProviderOnly() {
    flushTranslatedVoice('provider_close');
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
    const pairs = effectivePairs(caps?.supportedPairs, caps?.languages, caps?.allDistinctPairsAllowed);
    if (!pairAllowed(pairs, next.source, next.target)) {
      setErrorText('That language pair is not available.');
      setErrorAction(null);
      return;
    }
    const targets = targetsForSource(pairs, next.source);
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
    const snapshot: TranscriptItem[] = groupTranscriptParagraphs(entries).map((p) => ({
      kind: 'entry' as const,
      entry: {
        segmentId: `hist-${p.id}-${Date.now()}`,
        timeLabel: '',
        originalText: p.originalText || undefined,
        translatedText: p.translatedText,
        showOriginal,
        fontSize,
        final: true,
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
      setVoicePlaybackSafe(result.voicePlaybackSafe);
      setCanDuckOriginal(result.localPlaybackSuppressed);
      voiceSafeRef.current = result.voicePlaybackSafe;
      canDuckRef.current = result.localPlaybackSuppressed;
      if (!result.voicePlaybackSafe && outputModeRef.current === 'text-voice') {
        setOutputMode('text');
        outputModeRef.current = 'text';
        flushTranslatedVoice('capture_not_voice_safe');
      }
      syncVoiceEnabled();
      setSourceLabel(result.label);
      setSourceDetail(
        result.voicePlaybackSafe
          ? result.localPlaybackSuppressed
            ? 'Browser tab · Share tab audio · original routed through Luma'
            : 'Browser tab · Share tab audio · browser kept local tab sound'
          : result.displaySurface === 'monitor'
            ? 'Entire screen · translated voice disabled (loop risk)'
            : result.displaySurface === 'window'
              ? 'Application window · translated voice disabled'
              : 'Capture scope unknown · translated voice disabled',
      );
      startActivityMeter(result.stream);
      setState('idle');
      // Same capture gesture → begin translating without a second Start click.
      void startTranslation();
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
    const monitor =
      monitorRef.current ??
      createOriginalAudioMonitor({
        duckRatio: duckLevel,
        onGap: (droppedMs) => {
          setMetrics((m) => `${m} · gap ${Math.round(droppedMs)} ms`);
        },
      });
    monitorRef.current = monitor;
    monitor.setVolume(originalVolume);
    monitor.setDuckEnabled(duckOriginalRef.current && canDuckRef.current);
    monitor.setDuckRatio(duckLevel);
    monitor.attach({
      stream,
      // Only monitor when the tab’s own speakers were suppressed — otherwise we’d double the audio.
      monitor: canDuckRef.current,
      onSendAudio: (bytes) => provider.sendAudio(bytes),
      isSending: () => Boolean(sessionRef.current?.isSendingAudio()),
    });
    syncMonitorDuckFromPlayback();
    void monitor.unlock();
  }

  async function startTranslation() {
    if (starting) return;
    const session = sessionRef.current;
    const stream = streamRef.current;
    if (!session) return;

    if (!stream) {
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
    // Preserve prior paragraphs above a divider when restarting (Stop → Start).
    if (entries.length > 0) {
      const snapshot: TranscriptItem[] = groupTranscriptParagraphs(entries).map((p) => ({
        kind: 'entry' as const,
        entry: {
          segmentId: `hist-${p.id}-${Date.now()}`,
          timeLabel: '',
          originalText: p.originalText || undefined,
          translatedText: p.translatedText,
          showOriginal,
          fontSize,
          final: true,
          sourceLang: sourceLangRef.current,
          targetLang: targetLangRef.current,
        },
      }));
      setHistoryItems((prev) => [
        ...prev,
        ...snapshot,
        {
          kind: 'divider',
          id: `div-restart-${Date.now()}`,
          label: 'Previous session',
        },
      ]);
    }
    setEntries([]);
    setSeconds(0);
    setVoiceGapNote(null);
    voiceDiagRef.current = emptyVoiceDiag();
    setVoiceDiag(emptyVoiceDiag());
    setMetrics('Requesting temporary credential…');
    setState('connecting');

    // Unlock playback AudioContext from the Start click (autoplay policy).
    try {
      await playerRef.current?.unlock();
      bumpVoiceDiag({ ctx: playerRef.current?.getContextState() ?? 'none' });
    } catch {
      /* ignore — voice may stay silent until next gesture */
    }

    let token;
    try {
      token = await fetchLiveToken({
        sourceLanguage: sourceLangRef.current,
        targetLanguage: targetLangRef.current,
      });
    } catch (err) {
      setErrorText(friendlyErrorMessage(err, 'Could not start a secure session.'));
      setErrorAction('retry');
      setState('error');
      setStarting(false);
      return;
    }

    const sessionId = `luma-${Date.now()}`;
    activeSessionIdRef.current = sessionId;
    const provider = new GeminiLiveProvider();
    providerRef.current = provider;

    provider.on('inputLanguage', (payload) => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      const msg = payload as { languageCode?: string; sessionId?: string };
      if (msg.sessionId && msg.sessionId !== sessionId) return;
      // Do not compare provider generation to session generation — they are independent counters.
      gateRef.current?.noteInputLanguage(msg.languageCode);
      bumpVoiceDiag({ gate: gateRef.current?.getDecision() ?? 'pending' });
    });

    provider.on('audio', (payload) => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      const chunk = payload as TranslatedAudioChunk;
      // Provider sessionId must match; stamp session generation like transcripts (provider gen ≠ session gen).
      if (chunk.sessionId !== sessionId) {
        noteVoiceDiscard('session_mismatch');
        return;
      }
      voiceDiagRef.current.received += 1;
      const parsed = parseProviderPcmMime(chunk.mimeType);
      if (!parsed) {
        voiceDiagRef.current.badMime += 1;
        noteVoiceDiscard('bad_mime');
        return;
      }
      if (!pcm16leHasSignal(chunk.pcm)) {
        voiceDiagRef.current.silentPcm += 1;
        bumpVoiceDiag({
          received: voiceDiagRef.current.received,
          silentPcm: voiceDiagRef.current.silentPcm,
        });
        // Still enqueue — leading silence is valid PCM; only track for diagnostics.
      } else {
        bumpVoiceDiag({ received: voiceDiagRef.current.received });
      }
      gateRef.current?.pushAudio({
        pcm: chunk.pcm,
        sampleRate: parsed.sampleRate,
        mimeType: parsed.mimeType,
        generationId: activeGenerationRef.current,
        sessionId,
      });
    });

    provider.on('interrupted', () => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      flushTranslatedVoice('provider_interrupted');
    });

    provider.on('transcript', (payload) => {
      if (providerRef.current !== provider) return;
      if (activeSessionIdRef.current !== sessionId) return;
      const update = payload as TranscriptUpdate;
      if (update.sourceLanguage) {
        gateRef.current?.noteInputLanguage(update.sourceLanguage);
        bumpVoiceDiag({ gate: gateRef.current?.getDecision() ?? 'pending' });
      }
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
        flushTranslatedVoice('reconnect_gap');
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
            // Keep session generation for transcript/audio stamping (provider gen is independent).
            activeGenerationRef.current = session.getGenerationId();
            gateRef.current?.setSession(activeGenerationRef.current, sessionId);
            gateRef.current?.setSelectedSource(sourceLangRef.current);
            playerRef.current?.setSession(activeGenerationRef.current, sessionId);
            syncVoiceEnabled();
            void playerRef.current?.unlock();
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
              friendlyErrorMessage(
                reconnectErr,
                'Could not reconnect. Check your connection and try again.',
              ),
            );
            setErrorAction('retry');
            setState('error');
          }
        })();
        return;
      }
      setErrorText(friendlyErrorMessage(err, 'Something went wrong with translation.'));
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
      gateRef.current?.setSession(activeGenerationRef.current, sessionId);
      gateRef.current?.setSelectedSource(sourceLangRef.current);
      playerRef.current?.setSession(activeGenerationRef.current, sessionId);
      playerRef.current?.setVolume(voiceVolume);
      playerRef.current?.setMuted(voiceMuted);
      syncVoiceEnabled();
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
      setErrorText(friendlyErrorMessage(pe ?? err, 'Could not connect.'));
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
      flushTranslatedVoice('pause');
      return;
    }
    if (state === 'paused') {
      sessionRef.current?.resume();
      providerRef.current?.resumeSending();
      // Do not replay flushed speech — only new eligible audio after resume.
      return;
    }
    void startTranslation();
  }

  async function onStop() {
    await hardStop(true);
    setState('stopped');
  }

  function setOutputModeSafe(next: OutputMode) {
    if (next === 'text-voice' && !voicePlaybackSafe) {
      setErrorText(
        'Translated voice needs a browser-tab source (not this screen or an app window) so Luma’s playback isn’t recaptured.',
      );
      setErrorAction('choose-source');
      return;
    }
    if (next === 'text' && outputModeRef.current === 'text-voice') {
      // Immediate stop: flush queue + current phrase; keep subtitles and language decision.
      playerRef.current?.setEnabled(false);
      flushTranslatedVoice('text_only', { resetGate: false });
    }
    outputModeRef.current = next;
    setOutputMode(next);
    syncVoiceEnabled();
    if (next === 'text-voice') {
      // Enabling voice after Start must also unlock/resume AudioContext from this gesture.
      void playerRef.current?.unlock().then(() => {
        bumpVoiceDiag({ ctx: playerRef.current?.getContextState() ?? 'none' });
      });
    }
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

  const viewEntries: TranscriptEntryView[] = groupTranscriptParagraphs(entries).map((p) => ({
    segmentId: p.id,
    timeLabel: '',
    originalText: p.originalText || undefined,
    translatedText: p.translatedText,
    showOriginal,
    fontSize,
    final: p.final,
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
  const pairs = effectivePairs(caps?.supportedPairs, caps?.languages, caps?.allDistinctPairsAllowed);
  const pairOk = pairAllowed(pairs, sourceLang, targetLang);
  const canStart = Boolean(hasSource && pairOk && caps?.liveTestAllowed);
  const primaryLabel =
    state === 'listening'
      ? 'Pause'
      : state === 'paused'
        ? 'Resume'
        : state === 'reconnecting' || state === 'connecting' || starting
          ? 'Connecting…'
          : hasSource
            ? 'Start translation'
            : 'Choose audio source';
  const primaryIcon =
    primaryLabel === 'Pause' ? (
      <PauseIcon className="size-4" aria-hidden />
    ) : primaryLabel === 'Resume' || primaryLabel === 'Start translation' ? (
      <PlayIcon className="size-4" aria-hidden />
    ) : primaryLabel === 'Connecting…' ? (
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
    ) : (
      <AudioLinesIcon className="size-4" aria-hidden />
    );
  // Before capture, primary chooses source. After capture / while active, Start/Pause/Resume.
  const primaryBlocked =
    state === 'listening' || state === 'paused'
      ? false
      : !hasSource
        ? busy
        : !canStart || starting || state === 'connecting' || state === 'reconnecting';
  const showStop = busy || state === 'error' || state === 'quota_exhausted';
  const hasTranscript = entries.length > 0 || historyItems.length > 0;
  const voiceUnavailableReason = !hasSource
    ? 'Choose a Chrome tab (Teams / YouTube) with Share tab audio. Window or entire-screen capture can’t use Text + voice — Luma would hear its own speech.'
    : !voicePlaybackSafe
      ? sourceDetail.includes('window')
        ? 'This capture is an app window. Stop, choose source again, and pick a Chrome Tab (not Window or Entire screen).'
        : sourceDetail.includes('screen')
          ? 'This capture is the entire screen. Stop, choose source again, and pick a Chrome Tab with Share tab audio.'
          : 'This capture isn’t a browser tab (or the browser didn’t report one). Stop and re-share a Chrome Tab with Share tab audio.'
      : null;
  const voiceHelpShort = !hasSource
    ? 'Needs a Chrome tab + Share tab audio.'
    : !voicePlaybackSafe
      ? 'Needs a Chrome tab (not window/screen).'
      : null;
  const sourceLabelName = languageName(caps, sourceLang);
  const targetLabelName = languageName(caps, targetLang);
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

  function onPrimaryClick() {
    if (!hasSource && !busy) {
      void selectAudioSource();
      return;
    }
    onPrimary();
  }

  return (
    <div className="app-shell app-shell--live">
      <header className="app-header app-header--compact">
        <Brand compact />
        <PrivacyLabel />
      </header>

      <div className={`${stageClass} stage--live`}>
        <section className="session-toolbar" aria-label="Session controls">
          <div className="session-toolbar-row">
            <LanguagePairControls
              caps={caps}
              source={sourceLang}
              target={targetLang}
              disabled={starting || state === 'connecting' || state === 'reconnecting'}
              onRequestChange={requestLanguageChange}
            />

            <div className={`session-source-slot${hasSource ? ' has-source' : ''}`}>
              {hasSource ? (
                <div
                  className="session-source-card"
                  title={sourceDetail ? `${sourceLabel} — ${sourceDetail}` : sourceLabel}
                >
                  <AudioLinesIcon className="session-source-card-icon size-3.5" aria-hidden />
                  <div className="session-source-text">
                    <span className="session-source-name">{sourceLabel}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="session-source-change"
                    disabled={busy}
                    title={busy ? 'Stop translation to change source' : 'Change audio source'}
                    aria-label={busy ? 'Stop translation to change source' : 'Change audio source'}
                    onClick={() => void selectAudioSource()}
                  >
                    <RefreshCwIcon className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="session-source-placeholder" aria-hidden>
                  <span className="session-source-placeholder-label">
                    <AudioLinesIcon className="size-3.5" aria-hidden />
                    Audio source
                  </span>
                  <span className="session-source-placeholder-hint">Not chosen yet</span>
                </div>
              )}
            </div>

            <div className="session-output">
              <div className="session-output-modes">
                <ToggleGroup
                  type="single"
                  value={outputMode}
                  onValueChange={(next) => {
                    if (next === 'text' || next === 'text-voice') setOutputModeSafe(next);
                  }}
                  variant="outline"
                  spacing={0}
                  aria-label="Translation output"
                >
                  <ToggleGroupItem value="text" className="session-control px-3.5 text-sm">
                    Text
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="text-voice"
                    className="session-control px-3.5 text-sm"
                    disabled={Boolean(voiceUnavailableReason)}
                    title={voiceUnavailableReason ?? 'Play translated speech with subtitles'}
                    aria-description={voiceUnavailableReason ?? undefined}
                  >
                    Text + voice
                  </ToggleGroupItem>
                </ToggleGroup>
                {voiceHelpShort ? (
                  <p className="session-help" role="note" title={voiceUnavailableReason ?? undefined}>
                    {voiceHelpShort}
                  </p>
                ) : null}
              </div>
              {outputMode === 'text-voice' || voicePlaybackSafe ? (
                <AudioSettingsDialog
                  enabled={outputMode === 'text-voice'}
                  voiceVolume={voiceVolume}
                  voiceMuted={voiceMuted}
                  originalVolume={originalVolume}
                  duckOriginal={duckOriginal}
                  duckLevel={duckLevel}
                  canDuckOriginal={canDuckOriginal}
                  onVoiceVolume={setVoiceVolume}
                  onVoiceMuted={setVoiceMuted}
                  onOriginalVolume={setOriginalVolume}
                  onDuckOriginal={setDuckOriginal}
                  onDuckLevel={setDuckLevel}
                />
              ) : null}
            </div>
          </div>

          <div className="session-toolbar-row session-toolbar-row--actions">
            <StatusLine
              tone={statusToneFromState(state, hasSource)}
              indicator={
                <StatusIndicator
                  tone={statusToneFromState(state, hasSource)}
                  activity={state === 'listening' ? level : 0}
                />
              }
            >
              {statusCopy(state, hasSource, pairOk)}
            </StatusLine>
            {voiceGapNote ? <span className="session-note">{voiceGapNote}</span> : null}
            <SessionControls
              timerLabel={sessionActive || seconds > 0 ? clock(seconds) : undefined}
              primaryLabel={primaryLabel}
              onPrimary={onPrimaryClick}
              onStop={() => void onStop()}
              primaryDisabled={primaryBlocked}
              stopDisabled={!showStop}
              showStop={showStop}
              stopAction={
                showStop ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="session-control"
                    onClick={() => void onStop()}
                    title="Stop translation and release capture"
                  >
                    <SquareIcon className="size-3.5 fill-current" aria-hidden />
                    Stop
                  </Button>
                ) : null
              }
              primaryAction={
                <Button
                  type="button"
                  className="session-primary session-control"
                  onClick={onPrimaryClick}
                  disabled={primaryBlocked}
                  title={
                    primaryBlocked
                      ? !hasSource
                        ? 'Choose an audio source first'
                        : !pairOk
                          ? 'Choose a supported language pair'
                          : 'Connecting…'
                      : primaryLabel
                  }
                >
                  {primaryIcon}
                  {primaryLabel}
                </Button>
              }
            />
          </div>

          {capsError ? (
            <Alert variant="destructive">
              <AlertTitle>Translation service unreachable</AlertTitle>
              <AlertDescription>Start the Go API, then refresh.</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCapsError(null);
                    void fetchCapabilities()
                      .then((c) => {
                        setCaps(c);
                        const stored = loadStoredPair();
                        const pairs = effectivePairs(
                          c.supportedPairs,
                          c.languages,
                          c.allDistinctPairsAllowed,
                        );
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
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {errorText ? (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{errorText}</AlertDescription>
              {errorAction ? (
                <AlertAction>
                  <Button type="button" variant="outline" size="sm" onClick={onErrorAction}>
                    {errorAction === 'choose-source' ? 'Choose source again' : 'Retry connection'}
                  </Button>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}
        </section>

        <section className="subtitle-stage transcript-stage" aria-label="Live transcript">
          <div className="transcript-chrome">
            <DualTranscriptPanel
              items={transcriptItems}
              sourceLanguageName={sourceLabelName}
              targetLanguageName={targetLabelName}
              sourceLangCode={sourceLang}
              targetLangCode={targetLang}
              fontSize={fontSize}
              emptyOriginal={
                sessionActive
                  ? state === 'connecting' || state === 'reconnecting'
                    ? 'Connecting… speech will appear here when ready.'
                    : state === 'paused'
                      ? 'Paused — resume to continue capturing speech.'
                      : 'Listening… your captured speech appears here.'
                  : hasSource
                    ? 'Audio ready — your captured speech appears here.'
                    : 'Your captured speech appears here.'
              }
              emptyTranslation={
                sessionActive
                  ? state === 'connecting' || state === 'reconnecting'
                    ? 'Connecting… translation will appear here when ready.'
                    : state === 'paused'
                      ? 'Paused — resume to continue translating.'
                      : 'Listening… your translation appears here.'
                  : hasSource
                    ? 'Audio ready — your translation appears here.'
                    : 'Your translation appears here.'
              }
              toolbar={
                <>
                  <div className="font-size-controls" role="group" aria-label="Text size">
                    <span className="font-size-label">Text size</span>
                    <Button
                      type="button"
                      variant="outline"
                      className="session-control-icon"
                      disabled={fontSize <= 14}
                      title={fontSize <= 14 ? 'Smallest text size' : 'Decrease text size'}
                      onClick={() => setFontSize((n) => Math.max(14, n - 2))}
                      aria-label="Decrease text size"
                    >
                      A−
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="session-control-icon"
                      disabled={fontSize >= 28}
                      title={fontSize >= 28 ? 'Largest text size' : 'Increase text size'}
                      onClick={() => setFontSize((n) => Math.min(28, n + 2))}
                      aria-label="Increase text size"
                    >
                      A+
                    </Button>
                  </div>
                  {hasTranscript ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="session-control"
                      title="Clear both transcript panels"
                      onClick={() => setConfirmClear(true)}
                    >
                      <EraserIcon className="size-4" aria-hidden />
                      Clear both
                    </Button>
                  ) : null}
                </>
              }
            />
          </div>
        </section>
      </div>

      <AlertDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear both transcripts?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes original and translation text from this session. Translation keeps running if
              it is already active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep text</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                sessionRef.current?.clear();
                setEntries([]);
                setHistoryItems([]);
                setConfirmClear(false);
              }}
            >
              Clear both
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingPair)}
        onOpenChange={(open) => {
          if (!open) setPendingPair(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart translation?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing languages ends the current session. Pending audio is discarded, a new token is
              minted, and late results from the old session are ignored. Existing subtitles stay above
              a language-pair divider.
              {pendingPair ? (
                <>
                  {' '}
                  Switch to {languageName(caps, pendingPair.source)} →{' '}
                  {languageName(caps, pendingPair.target)}?
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmLanguageRestart()}>
              Restart with new languages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
