/**
 * Public UI mode from NEXT_PUBLIC_LUMA_MODE.
 * Supported values (plan + ENV_SETUP): demo | capture | live
 * Invalid / missing → live (real translation is the product default).
 */
export type LumaPublicMode = 'demo' | 'capture' | 'live';

export function parseLumaMode(raw: string | undefined | null): LumaPublicMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'demo' || value === 'capture' || value === 'live') {
    return value;
  }
  return 'live';
}

export function getLumaMode(): LumaPublicMode {
  return parseLumaMode(process.env.NEXT_PUBLIC_LUMA_MODE);
}

/** True when the product surface must never auto-load mock subtitles. */
export function isRealTranslationMode(mode: LumaPublicMode = getLumaMode()): boolean {
  return mode === 'live' || mode === 'capture';
}
