'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Capabilities, LanguageInfo, SupportedPair } from '../lib/api';

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

export function pairAllowed(pairs: SupportedPair[] | undefined, source: string, target: string): boolean {
  if (!pairs?.length) return false;
  return pairs.some((p) => p.source === source && p.target === target);
}

export function targetsForSource(pairs: SupportedPair[] | undefined, source: string): string[] {
  if (!pairs?.length) return [];
  return pairs.filter((p) => p.source === source).map((p) => p.target);
}

export function sourcesFromPairs(pairs: SupportedPair[] | undefined): string[] {
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

function SearchableSelect({
  label,
  value,
  options,
  languages,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  languages: LanguageInfo[];
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const labeled = useMemo(
    () =>
      options.map((code) => ({
        code,
        name: languages.find((l) => l.code === code)?.name ?? code,
      })),
    [options, languages],
  );

  const filtered = labeled.filter((o) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return o.code.includes(q) || o.name.toLowerCase().includes(q);
  });

  const selectedName = labeled.find((o) => o.code === value)?.name ?? value;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="lang-select" ref={rootRef}>
      <label className="lang-select-label" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <button
        type="button"
        id={`${listId}-input`}
        className="lang-select-trigger"
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery('');
        }}
      >
        <span>{selectedName}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div className="lang-select-popover" role="listbox" aria-label={label}>
          <input
            className="lang-select-search"
            type="search"
            placeholder="Search languages"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && filtered[0]) {
                onChange(filtered[0].code);
                setOpen(false);
              }
            }}
          />
          <ul className="lang-select-options">
            {filtered.length === 0 ? (
              <li className="lang-select-empty">No verified languages match.</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={opt.code === value}
                    className={opt.code === value ? 'is-selected' : undefined}
                    onClick={() => {
                      onChange(opt.code);
                      setOpen(false);
                    }}
                  >
                    {opt.name}
                    <span className="lang-code">{opt.code}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
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
  const pairs = caps?.supportedPairs ?? [];
  const languages = caps?.languages ?? [];
  const sources = sourcesFromPairs(pairs);
  const targets = targetsForSource(pairs, source);
  const swapOk = pairAllowed(pairs, target, source);

  function setSource(code: string) {
    if (code === target) return;
    const nextTargets = targetsForSource(pairs, code);
    const nextTarget = nextTargets.includes(target) ? target : nextTargets[0];
    if (!nextTarget) return;
    onRequestChange({ source: code, target: nextTarget });
  }

  function setTarget(code: string) {
    if (code === source) return;
    if (!pairAllowed(pairs, source, code)) return;
    onRequestChange({ source, target: code });
  }

  return (
    <div className="lang-pair">
      <SearchableSelect
        label="Translate from"
        value={source}
        options={sources}
        languages={languages}
        disabled={disabled}
        onChange={setSource}
      />
      <button
        type="button"
        className="btn btn-ghost lang-swap"
        disabled={disabled || !swapOk}
        title={swapOk ? 'Swap languages' : 'Reverse pair is not verified yet'}
        aria-label={swapOk ? 'Swap languages' : 'Swap unavailable — reverse pair not verified'}
        onClick={() => {
          if (!swapOk) return;
          onRequestChange({ source: target, target: source });
        }}
      >
        ⇄
      </button>
      <SearchableSelect
        label="Translate into"
        value={target}
        options={targets}
        languages={languages}
        disabled={disabled}
        onChange={setTarget}
      />
    </div>
  );
}
