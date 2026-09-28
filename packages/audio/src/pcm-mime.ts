/** Parse Gemini Live Translate output MIME (PCM) into encoding + sample rate. */

export type ParsedPcmMime = {
  encoding: 's16le';
  sampleRate: number;
  mimeType: string;
};

/**
 * Accepts forms like:
 * - audio/pcm;rate=24000
 * - audio/pcm; rate=24000; encoding=linear16
 * - audio/L16;rate=24000
 * Rejects unknown encodings or missing/invalid rates.
 */
export function parseProviderPcmMime(mimeType: string | undefined | null): ParsedPcmMime | null {
  if (!mimeType || typeof mimeType !== 'string') return null;
  const raw = mimeType.trim().toLowerCase();
  if (!raw) return null;

  const [typePart, ...paramParts] = raw.split(';').map((p) => p.trim());
  const type = typePart ?? '';
  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    params.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }

  const rateRaw = params.get('rate') ?? params.get('samplerate');
  const sampleRate = rateRaw ? Number(rateRaw) : NaN;
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    return null;
  }

  const encodingParam = params.get('encoding') ?? params.get('codec') ?? '';

  if (type === 'audio/pcm' || type === 'audio/l16' || type === 'audio/x-raw') {
    if (
      encodingParam &&
      encodingParam !== 'linear16' &&
      encodingParam !== 's16le' &&
      encodingParam !== 'pcm' &&
      encodingParam !== 'signed-integer'
    ) {
      return null;
    }
    return { encoding: 's16le', sampleRate: Math.round(sampleRate), mimeType: mimeType.trim() };
  }

  return null;
}

export function pcm16leDurationMs(byteLength: number, sampleRate: number): number {
  if (sampleRate <= 0 || byteLength <= 0) return 0;
  const samples = Math.floor(byteLength / 2);
  return (samples * 1000) / sampleRate;
}

/** True when PCM contains at least one nonzero sample (finite). */
export function pcm16leHasSignal(pcm: Uint8Array): boolean {
  if (pcm.byteLength < 2) return false;
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples = Math.floor(pcm.byteLength / 2);
  for (let i = 0; i < samples; i += 1) {
    const v = view.getInt16(i * 2, true);
    if (!Number.isFinite(v)) return false;
    if (v !== 0) return true;
  }
  return false;
}

