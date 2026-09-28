'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export function Brand({ compact = false }: { compact?: boolean; tagline?: string }) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'}>
      <div className="brand-mark" aria-hidden>
        ≈
      </div>
      <div>
        <div className="brand-name">luma</div>
        {!compact ? <div className="brand-tag">Understand what you’re listening to</div> : null}
      </div>
    </div>
  );
}

export function PrivacyLabel() {
  return (
    <p className="privacy-label" role="note">
      Playback audio only · Microphone not captured
    </p>
  );
}

export function StatusLine({
  children,
  indicator,
  tone = 'idle',
}: {
  children: ReactNode;
  /** Visual status mark (wave bars, icon). Replaces the old status dot. */
  indicator?: ReactNode;
  tone?: 'idle' | 'listening' | 'paused' | 'error' | 'connecting' | 'ready';
}) {
  return (
    <div className={`status-line status-line--${tone}`} role="status" aria-live="polite">
      {indicator ? (
        <span className="status-indicator" aria-hidden>
          {indicator}
        </span>
      ) : null}
      <span>{children}</span>
    </div>
  );
}

export function SourceBar({
  hasSource,
  name,
  detail,
  chooseAction,
  changeAction,
}: {
  hasSource: boolean;
  name: string;
  detail?: string;
  /** Injected action control (e.g. shadcn Button from the app). */
  chooseAction: ReactNode;
  changeAction: ReactNode;
}) {
  if (!hasSource) {
    return <div className="source-bar source-bar--empty">{chooseAction}</div>;
  }
  return (
    <div className="source-bar">
      <div className="source-bar-text">
        <div className="source-bar-name">{name}</div>
        {detail ? <div className="source-bar-detail">{detail}</div> : null}
      </div>
      {changeAction}
    </div>
  );
}

export type TranscriptEntryView = {
  segmentId: string;
  timeLabel: string;
  originalText?: string;
  translatedText: string;
  showOriginal: boolean;
  fontSize: number;
  final: boolean;
  sourceLang?: string;
  targetLang?: string;
};

export type TranscriptItem =
  | { kind: 'divider'; id: string; label: string }
  | { kind: 'entry'; entry: TranscriptEntryView };

function useFollowScroll(deps: unknown) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [deps, pinned]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 48;
    setPinned(atBottom);
    setShowJump(!atBottom && el.scrollHeight > el.clientHeight + 8);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
    setShowJump(false);
  }

  return { scrollerRef, showJump, onScroll, jumpToLatest };
}

export function TranscriptPanel({
  items,
  entries,
  empty,
  fontSize,
}: {
  items?: TranscriptItem[];
  entries?: TranscriptEntryView[];
  empty: ReactNode;
  fontSize: number;
}) {
  const resolved: TranscriptItem[] =
    items ??
    (entries ?? []).map((entry) => ({
      kind: 'entry' as const,
      entry,
    }));

  const entryCount = resolved.filter((i) => i.kind === 'entry').length;
  const { scrollerRef, showJump, onScroll, jumpToLatest } = useFollowScroll(resolved);

  return (
    <div className="transcript-shell">
      <div
        ref={scrollerRef}
        className="transcript-scroll"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={onScroll}
        tabIndex={0}
        style={{ ['--subtitle-size' as string]: `${fontSize}px` }}
      >
        {entryCount === 0 && !resolved.some((i) => i.kind === 'divider') ? empty : null}
        {resolved.map((item) =>
          item.kind === 'divider' ? (
            <div key={item.id} className="pair-divider" role="separator">
              <span>{item.label}</span>
            </div>
          ) : (
            <article
              key={item.entry.segmentId}
              className={`subtitle-row${item.entry.final ? ' is-final' : ' is-provisional'}`}
            >
              <time className="subtitle-time" dateTime={item.entry.timeLabel}>
                {item.entry.timeLabel}
              </time>
              <div className="subtitle-body">
                {item.entry.showOriginal && item.entry.originalText ? (
                  <p className="subtitle-ko" lang={item.entry.sourceLang ?? 'und'}>
                    {item.entry.originalText}
                  </p>
                ) : null}
                <p className="subtitle-en" lang={item.entry.targetLang ?? 'en'}>
                  {item.entry.translatedText}
                  {!item.entry.final ? <span className="provisional-mark"> · updating</span> : null}
                </p>
              </div>
            </article>
          ),
        )}
      </div>
      {showJump ? (
        <button type="button" className="jump-latest" onClick={jumpToLatest}>
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}

function joinPanelText(
  items: TranscriptItem[],
  side: 'original' | 'translation',
): string {
  return items
    .filter((i): i is { kind: 'entry'; entry: TranscriptEntryView } => i.kind === 'entry')
    .map((i) =>
      side === 'original' ? i.entry.originalText?.trim() : i.entry.translatedText?.trim(),
    )
    .filter((t): t is string => Boolean(t))
    .join('\n\n');
}

function CopyPanelButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;

  return (
    <button
      type="button"
      className="dual-copy-btn"
      title={label}
      aria-label={copied ? `${label} — copied` : label}
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard may be unavailable */
          }
        })();
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Two-column live transcript: continuous original | translation paragraphs. */
export function DualTranscriptPanel({
  items,
  sourceLanguageName,
  targetLanguageName,
  sourceLangCode,
  targetLangCode,
  fontSize,
  emptyOriginal,
  emptyTranslation,
  empty,
  toolbar,
}: {
  items: TranscriptItem[];
  sourceLanguageName: string;
  targetLanguageName: string;
  sourceLangCode: string;
  targetLangCode: string;
  fontSize: number;
  /** Preferred empty copy for the Original panel. */
  emptyOriginal?: ReactNode;
  /** Preferred empty copy for the Translation panel. */
  emptyTranslation?: ReactNode;
  /** @deprecated Prefer emptyOriginal / emptyTranslation */
  empty?: ReactNode;
  /** Optional chrome above the two panels (text size, clear). */
  toolbar?: ReactNode;
}) {
  const entries = items.filter((i): i is { kind: 'entry'; entry: TranscriptEntryView } => i.kind === 'entry');
  const dividers = items.filter((i): i is { kind: 'divider'; id: string; label: string } => i.kind === 'divider');
  const left = useFollowScroll(items);
  const right = useFollowScroll(items);
  const emptyBoth = entries.length === 0 && dividers.length === 0;
  const originalText = joinPanelText(items, 'original');
  const translationText = joinPanelText(items, 'translation');
  const originalEmpty = emptyOriginal ?? empty;
  const translationEmpty = emptyTranslation ?? empty;

  return (
    <div className="dual-transcript" style={{ ['--subtitle-size' as string]: `${fontSize}px` }}>
      {toolbar ? <div className="dual-transcript-toolbar">{toolbar}</div> : null}
      <div className="dual-transcript-cols">
        <section className="dual-col dual-col-original" aria-label={`Original ${sourceLanguageName}`}>
          <header className="dual-col-head">
            <h2>Original · {sourceLanguageName}</h2>
            <CopyPanelButton label="Copy original" text={originalText} />
          </header>
          <div
            ref={left.scrollerRef}
            className="dual-col-scroll"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            onScroll={left.onScroll}
            tabIndex={0}
          >
            {emptyBoth ? (
              <div className="transcript-empty transcript-empty--panel">{originalEmpty}</div>
            ) : null}
            {items.map((item) => {
              if (item.kind === 'divider') {
                return (
                  <div key={`o-${item.id}`} className="pair-divider" role="separator">
                    <span>{item.label}</span>
                  </div>
                );
              }
              const text = item.entry.originalText?.trim();
              if (!text && item.entry.final) return null;
              return (
                <p
                  key={`o-${item.entry.segmentId}`}
                  className={`dual-flow-para${item.entry.final ? '' : ' is-active'}`}
                  lang={item.entry.sourceLang ?? sourceLangCode}
                >
                  {text || '…'}
                </p>
              );
            })}
          </div>
          {left.showJump ? (
            <button type="button" className="jump-latest" onClick={left.jumpToLatest}>
              Jump to latest
            </button>
          ) : null}
        </section>

        <section className="dual-col dual-col-translation" aria-label={`Translation ${targetLanguageName}`}>
          <header className="dual-col-head">
            <h2>Translation · {targetLanguageName}</h2>
            <CopyPanelButton label="Copy translation" text={translationText} />
          </header>
          <div
            ref={right.scrollerRef}
            className="dual-col-scroll"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            onScroll={right.onScroll}
            tabIndex={0}
          >
            {emptyBoth ? (
              <div className="transcript-empty transcript-empty--panel">{translationEmpty}</div>
            ) : null}
            {items.map((item) => {
              if (item.kind === 'divider') {
                return (
                  <div key={`t-${item.id}`} className="pair-divider" role="separator">
                    <span>{item.label}</span>
                  </div>
                );
              }
              const text = item.entry.translatedText?.trim();
              if (!text && item.entry.final) return null;
              return (
                <p
                  key={`t-${item.entry.segmentId}`}
                  className={`dual-flow-para dual-flow-translation${item.entry.final ? '' : ' is-active'}`}
                  lang={item.entry.targetLang ?? targetLangCode}
                >
                  {text || '…'}
                </p>
              );
            })}
          </div>
          {right.showJump ? (
            <button type="button" className="jump-latest" onClick={right.jumpToLatest}>
              Jump to latest
            </button>
          ) : null}
        </section>
      </div>

      <div className="dual-transcript-stack">
        <DualTranscriptStacked
          items={items}
          sourceLanguageName={sourceLanguageName}
          targetLanguageName={targetLanguageName}
          sourceLangCode={sourceLangCode}
          targetLangCode={targetLangCode}
          fontSize={fontSize}
          emptyOriginal={originalEmpty}
          emptyTranslation={translationEmpty}
          originalText={originalText}
          translationText={translationText}
        />
      </div>
    </div>
  );
}

function DualTranscriptStacked({
  items,
  sourceLanguageName,
  targetLanguageName,
  sourceLangCode,
  targetLangCode,
  fontSize,
  emptyOriginal,
  emptyTranslation,
  originalText,
  translationText,
}: {
  items: TranscriptItem[];
  sourceLanguageName: string;
  targetLanguageName: string;
  sourceLangCode: string;
  targetLangCode: string;
  fontSize: number;
  emptyOriginal?: ReactNode;
  emptyTranslation?: ReactNode;
  originalText: string;
  translationText: string;
}) {
  const left = useFollowScroll(items);
  const right = useFollowScroll(items);
  const entryCount = items.filter((i) => i.kind === 'entry').length;
  const emptyBoth = entryCount === 0 && !items.some((i) => i.kind === 'divider');

  return (
    <div className="dual-stack-shell" style={{ ['--subtitle-size' as string]: `${fontSize}px` }}>
      <section
        className="dual-col dual-col-original dual-stack-panel"
        aria-label={`Original ${sourceLanguageName}`}
      >
        <header className="dual-col-head">
          <h2>Original · {sourceLanguageName}</h2>
          <CopyPanelButton label="Copy original" text={originalText} />
        </header>
        <div
          ref={left.scrollerRef}
          className="dual-col-scroll"
          role="log"
          aria-live="polite"
          onScroll={left.onScroll}
          tabIndex={0}
        >
          {emptyBoth ? (
            <div className="transcript-empty transcript-empty--panel">{emptyOriginal}</div>
          ) : null}
          {items.map((item) => {
            if (item.kind === 'divider') {
              return (
                <div key={`so-${item.id}`} className="pair-divider" role="separator">
                  <span>{item.label}</span>
                </div>
              );
            }
            const text = item.entry.originalText?.trim();
            if (!text && item.entry.final) return null;
            return (
              <p
                key={`so-${item.entry.segmentId}`}
                className={`dual-flow-para${item.entry.final ? '' : ' is-active'}`}
                lang={item.entry.sourceLang ?? sourceLangCode}
              >
                {text || '…'}
              </p>
            );
          })}
        </div>
        {left.showJump ? (
          <button type="button" className="jump-latest" onClick={left.jumpToLatest}>
            Jump to latest
          </button>
        ) : null}
      </section>
      <section
        className="dual-col dual-col-translation dual-stack-panel"
        aria-label={`Translation ${targetLanguageName}`}
      >
        <header className="dual-col-head">
          <h2>Translation · {targetLanguageName}</h2>
          <CopyPanelButton label="Copy translation" text={translationText} />
        </header>
        <div
          ref={right.scrollerRef}
          className="dual-col-scroll"
          role="log"
          aria-live="polite"
          onScroll={right.onScroll}
          tabIndex={0}
        >
          {emptyBoth ? (
            <div className="transcript-empty transcript-empty--panel">{emptyTranslation}</div>
          ) : null}
          {items.map((item) => {
            if (item.kind === 'divider') {
              return (
                <div key={`st-${item.id}`} className="pair-divider" role="separator">
                  <span>{item.label}</span>
                </div>
              );
            }
            const text = item.entry.translatedText?.trim();
            if (!text && item.entry.final) return null;
            return (
              <p
                key={`st-${item.entry.segmentId}`}
                className={`dual-flow-para dual-flow-translation${item.entry.final ? '' : ' is-active'}`}
                lang={item.entry.targetLang ?? targetLangCode}
              >
                {text || '…'}
              </p>
            );
          })}
        </div>
        {right.showJump ? (
          <button type="button" className="jump-latest" onClick={right.jumpToLatest}>
            Jump to latest
          </button>
        ) : null}
      </section>
    </div>
  );
}

export function SessionControls({
  primaryLabel,
  onPrimary,
  onStop,
  primaryDisabled,
  stopDisabled,
  showStop = true,
  timerLabel,
  primaryAction,
  stopAction,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onStop: () => void;
  primaryDisabled?: boolean;
  stopDisabled: boolean;
  /** When false, Stop is omitted entirely (pre-session). */
  showStop?: boolean;
  timerLabel?: string;
  /** Injected primary control; falls back to a native button for demos/tests. */
  primaryAction?: ReactNode;
  /** Injected stop control; falls back to a native button for demos/tests. */
  stopAction?: ReactNode;
}) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === ' ' && !primaryDisabled) {
      e.preventDefault();
      onPrimary();
    }
  }

  return (
    <div className="session-controls" onKeyDown={onKey}>
      {timerLabel ? (
        <span className="session-timer" aria-label={`Session time ${timerLabel}`}>
          {timerLabel}
        </span>
      ) : (
        <span />
      )}
      <div className="session-actions">
        {showStop
          ? (stopAction ?? (
              <button type="button" className="btn btn-ghost" onClick={onStop} disabled={stopDisabled}>
                Stop
              </button>
            ))
          : null}
        {primaryAction ?? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPrimary}
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** @deprecated Prefer SourceBar — kept for Dev demo compatibility */
export function SourceCard({
  name,
  detail,
  icon,
}: {
  name: string;
  detail: string;
  icon: string;
}) {
  return (
    <div className="legacy-source-card">
      <div className="legacy-source-card-row">
        <span className="legacy-source-icon" aria-hidden>
          {icon}
        </span>
        <span>{name}</span>
      </div>
      <div className="legacy-source-detail">{detail}</div>
    </div>
  );
}

/** @deprecated Prefer StatusLine */
export function StatusPill({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  return <span className={demo ? 'demo-pill status-pill' : 'status-pill'}>{children}</span>;
}

/** @deprecated Prefer TranscriptPanel */
export function TranscriptList({
  entries,
  emptyMessage,
}: {
  entries: TranscriptEntryView[];
  emptyMessage: string;
}) {
  return (
    <TranscriptPanel
      entries={entries}
      empty={<div className="transcript-empty">{emptyMessage}</div>}
      fontSize={entries[0]?.fontSize ?? 20}
    />
  );
}
