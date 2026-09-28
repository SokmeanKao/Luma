import type { TranscriptUpdate } from './types';

/**
 * Merge provider transcription text for one segment.
 * - Cumulative revision: next starts with prev → replace with next
 * - Stale shorter cumulative: prev starts with next → keep prev
 * - Exact duplicate → keep prev
 * - Otherwise treat as incremental delta → append (no invented sentence splits)
 */
export function mergeTranscriptText(prev: string, next: string): string {
  const a = prev ?? '';
  const b = next ?? '';
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b)) return a;
  if (a.endsWith(b)) return a;
  // Delta fragment: append. Avoid injecting spaces before punctuation.
  const needsSpace = !/\s$/.test(a) && !/^\s/.test(b) && !/^[.,!?;:‘’''")\]]/.test(b);
  return needsSpace ? `${a} ${b}` : `${a}${b}`;
}

function entryKey(sessionId: string, segmentId: string): string {
  return `${sessionId}\u0000${segmentId}`;
}

export class TranscriptAssembler {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, TranscriptUpdate>();
  private readonly order: string[] = [];

  constructor(opts: { maxEntries: number }) {
    this.maxEntries = opts.maxEntries;
  }

  apply(update: TranscriptUpdate): TranscriptUpdate | null {
    if (!update.sessionId || !update.segmentId) return null;

    const key = entryKey(update.sessionId, update.segmentId);
    const existing = this.entries.get(key);

    // Never mutate or replace a finalized segment (prevents overwrite / duplicate finals).
    if (existing?.final) {
      return null;
    }

    if (existing && update.revision < existing.revision) {
      return null;
    }

    const mergedText = existing
      ? mergeTranscriptText(existing.translatedText, update.translatedText)
      : update.translatedText;

    const mergedOriginal =
      update.originalText !== undefined
        ? existing?.originalText
          ? mergeTranscriptText(existing.originalText, update.originalText)
          : update.originalText
        : existing?.originalText;

    const next: TranscriptUpdate = {
      ...existing,
      ...update,
      translatedText: mergedText,
      originalText: mergedOriginal,
      // Keep earliest capture time for the segment.
      captureTimestamp: existing?.captureTimestamp ?? update.captureTimestamp,
    };

    if (
      existing &&
      existing.translatedText === next.translatedText &&
      existing.originalText === next.originalText &&
      existing.final === next.final &&
      existing.revision === next.revision
    ) {
      return null;
    }

    if (!existing) {
      this.order.push(key);
    }
    this.entries.set(key, next);

    while (this.order.length > this.maxEntries) {
      const oldest = this.order.shift();
      if (oldest) this.entries.delete(oldest);
    }

    return this.entries.get(key) ?? null;
  }

  list(): TranscriptUpdate[] {
    return this.order
      .map((id) => this.entries.get(id))
      .filter((e): e is TranscriptUpdate => Boolean(e));
  }

  clear(): void {
    this.entries.clear();
    this.order.length = 0;
  }
}
