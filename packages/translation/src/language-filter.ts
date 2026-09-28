export function normalizeLanguageCode(code?: string): string | undefined {
  if (!code) return undefined;
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return undefined;
  const primary = trimmed.split(/[-_]/)[0];
  return primary || undefined;
}

/**
 * Visible-output filter for selected source language.
 * Unknown detection → allow (uncertain; do not invent a score).
 * Detected other languages → suppress.
 * Note: provider echoTargetLanguage=false is NOT equivalent to this filter.
 */
export function shouldDisplayTranslation(opts: {
  selectedSource: string;
  detectedSource?: string;
}): boolean {
  const selected = normalizeLanguageCode(opts.selectedSource) ?? 'ko';
  const detected = normalizeLanguageCode(opts.detectedSource);
  if (!detected) return true;
  return detected === selected;
}
