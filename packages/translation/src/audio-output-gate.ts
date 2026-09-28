import { normalizeLanguageCode } from './language-filter';
import { shouldDisplayTranslation } from './language-filter';

export type GatedAudioChunk = {
  pcm: Uint8Array;
  sampleRate: number;
  mimeType: string;
  generationId: number;
  sessionId: string;
};

/**
 * Audio must not play when language is unknown.
 * Text filter allows unknown; voice does not — buffer briefly, then discard.
 */
export function audioFilterDecision(opts: {
  selectedSource: string;
  detectedSource?: string;
}): 'play' | 'suppress' | 'pending' {
  const detected = normalizeLanguageCode(opts.detectedSource);
  if (!detected) return 'pending';
  return shouldDisplayTranslation({
    selectedSource: opts.selectedSource,
    detectedSource: detected,
  })
    ? 'play'
    : 'suppress';
}

export type TranslatedAudioOutputGateOptions = {
  /** How long to wait for a language decision before discarding buffered audio. */
  pendingTimeoutMs?: number;
  /** Max buffered pending duration (ms) before forced discard. */
  maxPendingMs?: number;
  onPlay: (chunk: GatedAudioChunk) => void;
  onDiscard?: (reason: string) => void;
};

/**
 * Associates provider audio with source-language filter decisions.
 * Uncertain audio is never played.
 */
export function createTranslatedAudioOutputGate(opts: TranslatedAudioOutputGateOptions) {
  const pendingTimeoutMs = opts.pendingTimeoutMs ?? 2000;
  const maxPendingMs = opts.maxPendingMs ?? 3000;
  let selectedSource = 'ko';
  let generationId = -1;
  let sessionId = '';
  let decision: 'play' | 'suppress' | 'pending' = 'pending';
  let detectedSource: string | undefined;
  let pending: GatedAudioChunk[] = [];
  let pendingMs = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function discardPending(reason: string) {
    if (pending.length === 0) return;
    pending = [];
    pendingMs = 0;
    opts.onDiscard?.(reason);
  }

  function releasePending() {
    const batch = pending;
    pending = [];
    pendingMs = 0;
    for (const chunk of batch) {
      if (chunk.generationId !== generationId || chunk.sessionId !== sessionId) continue;
      opts.onPlay(chunk);
    }
  }

  function armTimeout() {
    clearTimer();
    if (decision !== 'pending' || pending.length === 0) return;
    timer = setTimeout(() => {
      timer = null;
      if (decision === 'pending') {
        discardPending('language_decision_timeout');
      }
    }, pendingTimeoutMs);
  }

  function applyDecision(next: 'play' | 'suppress' | 'pending') {
    decision = next;
    if (next === 'play') {
      clearTimer();
      releasePending();
    } else if (next === 'suppress') {
      clearTimer();
      discardPending('language_filtered');
    } else {
      armTimeout();
    }
  }

  return {
    setSelectedSource(code: string): void {
      selectedSource = normalizeLanguageCode(code) ?? 'ko';
      applyDecision(audioFilterDecision({ selectedSource, detectedSource }));
    },

    setSession(nextGenerationId: number, nextSessionId: string): void {
      clearTimer();
      discardPending('session_reset');
      generationId = nextGenerationId;
      sessionId = nextSessionId;
      detectedSource = undefined;
      decision = 'pending';
    },

    noteInputLanguage(code?: string): void {
      if (code) detectedSource = code;
      applyDecision(audioFilterDecision({ selectedSource, detectedSource }));
    },

    noteInterrupted(): void {
      clearTimer();
      discardPending('interrupted');
      // Require a fresh language association after barge-in.
      detectedSource = undefined;
      decision = 'pending';
    },

    pushAudio(chunk: GatedAudioChunk): void {
      if (chunk.generationId !== generationId || chunk.sessionId !== sessionId) {
        opts.onDiscard?.('stale_generation');
        return;
      }

      if (decision === 'play') {
        opts.onPlay(chunk);
        return;
      }
      if (decision === 'suppress') {
        opts.onDiscard?.('language_filtered');
        return;
      }

      // pending
      const chunkMs = (chunk.pcm.byteLength / 2 / chunk.sampleRate) * 1000;
      pending.push(chunk);
      pendingMs += chunkMs;
      if (pendingMs > maxPendingMs) {
        discardPending('pending_buffer_overflow');
        return;
      }
      armTimeout();
    },

    reset(): void {
      clearTimer();
      discardPending('reset');
      detectedSource = undefined;
      decision = 'pending';
    },

    getDecision(): 'play' | 'suppress' | 'pending' {
      return decision;
    },
  };
}

export type TranslatedAudioOutputGate = ReturnType<typeof createTranslatedAudioOutputGate>;
