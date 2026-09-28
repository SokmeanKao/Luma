'use client';

import type { Capabilities } from '../lib/api';
import {
  effectiveLanguages,
  effectivePairs,
} from '../lib/language-catalog';
import { LanguageCombobox } from './LanguageCombobox';
import { Button } from './ui/button';

const STORAGE_KEY = 'luma.languagePair.v1';

export type LanguagePair = { source: string; target: string };

export function loadStoredPair(): LanguagePair | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LanguagePair;
    if (typeof parsed?.source === 'string' && typeof parsed?.target === 'string') {
      return { source: parsed.source.toLowerCase(), target: parsed.target.toLowerCase() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function storePair(pair: LanguagePair): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
  } catch {
    /* ignore */
  }
}

export function languageName(caps: Capabilities | null, code: string): string {
  const found = caps?.languages?.find((l) => l.code === code);
  return found?.name ?? code.toUpperCase();
}

export function pairAllowed(
  pairs: { source: string; target: string }[] | undefined,
  source: string,
  target: string,
): boolean {
  if (!pairs?.length) return false;
  return pairs.some((p) => p.source === source && p.target === target);
}

export function targetsForSource(
  pairs: { source: string; target: string }[] | undefined,
  source: string,
): string[] {
  if (!pairs?.length) return [];
  return pairs.filter((p) => p.source === source).map((p) => p.target);
}

export function sourcesFromPairs(pairs: { source: string; target: string }[] | undefined): string[] {
  if (!pairs?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pairs) {
    if (seen.has(p.source)) continue;
    seen.add(p.source);
    out.push(p.source);
  }
  return out;
}

export function LanguagePairControls({
  caps,
  source,
  target,
  disabled,
  onRequestChange,
}: {
  caps: Capabilities | null;
  source: string;
  target: string;
  disabled?: boolean;
  onRequestChange: (next: LanguagePair) => void;
}) {
  const pairs = effectivePairs(caps?.supportedPairs, caps?.languages, caps?.allDistinctPairsAllowed);
  const languages = effectiveLanguages(caps?.languages);
  const sources = sourcesFromPairs(pairs);
  const targets = targetsForSource(pairs, source);
  const swapOk = pairAllowed(pairs, target, source);

  function setSource(code: string) {
    if (code === target) {
      if (swapOk) onRequestChange({ source: target, target: source });
      return;
    }
    const nextTargets = targetsForSource(pairs, code);
    const nextTarget = nextTargets.includes(target) ? target : nextTargets[0];
    if (!nextTarget) return;
    onRequestChange({ source: code, target: nextTarget });
  }

  function setTarget(code: string) {
    if (code === source) {
      if (swapOk) onRequestChange({ source: target, target: source });
      return;
    }
    if (!pairAllowed(pairs, source, code)) return;
    onRequestChange({ source, target: code });
  }

  return (
    <div className="lang-pair lang-pair--compact" role="group" aria-label="Language pair">
      <LanguageCombobox
        label="Translate from"
        value={source}
        options={sources}
        languages={languages}
        disabled={disabled}
        title={disabled ? 'Stop or pause translation to change languages' : undefined}
        onChange={setSource}
        compact
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="lang-swap shrink-0"
        disabled={disabled || !swapOk}
        title={
          disabled
            ? 'Stop or pause translation to change languages'
            : swapOk
              ? 'Swap languages'
              : 'Reverse pair is not available'
        }
        aria-label={swapOk ? 'Swap languages' : 'Swap unavailable'}
        onClick={() => {
          if (!swapOk) return;
          onRequestChange({ source: target, target: source });
        }}
      >
        ⇄
      </Button>
      <LanguageCombobox
        label="Translate into"
        value={target}
        options={targets}
        languages={languages}
        disabled={disabled}
        title={disabled ? 'Stop or pause translation to change languages' : undefined}
        onChange={setTarget}
        compact
      />
    </div>
  );
}
