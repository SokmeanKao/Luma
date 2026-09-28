import { mergeTranscriptText } from './transcript';
import type { TranscriptUpdate } from './types';

/** Soft length: prefer a new paragraph after a completed sentence. */
export const PARAGRAPH_SOFT_CHARS = 220;
/** Hard length: break at a sentence or clause boundary beyond this. */
export const PARAGRAPH_HARD_CHARS = 420;

export type TranscriptParagraph = {
  /** Stable visual id (first segment id); not a provider segment. */
  id: string;
  sessionId: string;
  segmentIds: string[];
  originalText: string;
  translatedText: string;
  /** False while any included segment is still streaming. */
  final: boolean;
  captureTimestamp: number;
  sourceLanguage?: string;
};

function endsWithSentence(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /[.!?…]["'”’)\]]*$/u.test(t) || /[。！？]$/u.test(t);
}

function endsWithClause(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return endsWithSentence(t) || /[,;:]$/u.test(t) || /[，；：]$/u.test(t);
}

function measureLen(original: string, translated: string): number {
  return Math.max(original.trim().length, translated.trim().length);
}

function primaryText(original: string, translated: string): string {
  const t = translated.trim();
  if (t) return t;
  return original.trim();
}

/**
 * Whether the open paragraph should close before absorbing `next`.
 * Short provider turn endings alone never force a break.
 */
export function shouldStartNewParagraph(
  current: { originalText: string; translatedText: string; sessionId: string },
  next: Pick<TranscriptUpdate, 'sessionId'>,
): boolean {
  if (next.sessionId !== current.sessionId) return true;

  const len = measureLen(current.originalText, current.translatedText);
  const text = primaryText(current.originalText, current.translatedText);
  if (!text) return false;

  if (len >= PARAGRAPH_HARD_CHARS && endsWithClause(text)) return true;
  if (len >= PARAGRAPH_SOFT_CHARS && endsWithSentence(text)) return true;
  return false;
}

/**
 * Group provider segments into visual paragraphs.
 * Segment IDs are retained for debugging; the UI should render paragraphs only.
 */
export function groupTranscriptParagraphs(entries: TranscriptUpdate[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = [];
  let open: TranscriptParagraph | null = null;

  for (const entry of entries) {
    if (!open) {
      open = {
        id: `p-${entry.segmentId}`,
        sessionId: entry.sessionId,
        segmentIds: [entry.segmentId],
        originalText: entry.originalText ?? '',
        translatedText: entry.translatedText ?? '',
        final: entry.final,
        captureTimestamp: entry.captureTimestamp,
        sourceLanguage: entry.sourceLanguage,
      };
      continue;
    }

    if (shouldStartNewParagraph(open, entry)) {
      // Close prior paragraph as complete for display (its segments are already stored).
      open.final = true;
      paragraphs.push(open);
      open = {
        id: `p-${entry.segmentId}`,
        sessionId: entry.sessionId,
        segmentIds: [entry.segmentId],
        originalText: entry.originalText ?? '',
        translatedText: entry.translatedText ?? '',
        final: entry.final,
        captureTimestamp: entry.captureTimestamp,
        sourceLanguage: entry.sourceLanguage,
      };
      continue;
    }

    open.segmentIds.push(entry.segmentId);
    open.originalText = mergeTranscriptText(open.originalText, entry.originalText ?? '');
    open.translatedText = mergeTranscriptText(open.translatedText, entry.translatedText ?? '');
    open.final = open.final && entry.final;
    if (entry.sourceLanguage) open.sourceLanguage = entry.sourceLanguage;
  }

  if (open) paragraphs.push(open);
  return paragraphs;
}
