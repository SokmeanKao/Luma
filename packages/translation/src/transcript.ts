import type { TranscriptUpdate } from './types';

export class TranscriptAssembler {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, TranscriptUpdate>();
  private readonly order: string[] = [];

  constructor(opts: { maxEntries: number }) {
    this.maxEntries = opts.maxEntries;
  }

  apply(update: TranscriptUpdate): TranscriptUpdate | null {
    const existing = this.entries.get(update.segmentId);
    if (existing?.final) {
      return null;
    }
    if (existing && update.revision < existing.revision) {
      return null;
    }
    if (!existing) {
      this.order.push(update.segmentId);
    }
    this.entries.set(update.segmentId, { ...update });
    while (this.order.length > this.maxEntries) {
      const oldest = this.order.shift();
      if (oldest) this.entries.delete(oldest);
    }
    return this.entries.get(update.segmentId) ?? null;
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
