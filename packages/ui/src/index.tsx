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
      Playback audio only · Microphone off
    </p>
  );
}

export function StatusLine({ children }: { children: ReactNode }) {
  return (
    <div className="status-line" role="status" aria-live="polite">
      <span className="status-dot" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function SourceBar({
  hasSource,
  name,
  detail,
  busy,
  onChoose,
  onChange,
}: {
  hasSource: boolean;
  name: string;
  detail?: string;
  busy: boolean;
  onChoose: () => void;
  onChange: () => void;
}) {
  if (!hasSource) {
    return (
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onChoose}>
        Choose audio source
      </button>
    );
  }
  return (
    <div className="source-bar">
      <div className="source-bar-text">
        <div className="source-bar-name">{name}</div>
        {detail ? <div className="source-bar-detail">{detail}</div> : null}
      </div>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={onChange}>
        Change
      </button>
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

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const entryCount = resolved.filter((i) => i.kind === 'entry').length;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [resolved, pinned]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 48;
    setPinned(atBottom);
    setShowJump(!atBottom && entryCount > 0);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
    setShowJump(false);
  }

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

export function SessionControls({
  primaryLabel,
  onPrimary,
  onStop,
  primaryDisabled,
  stopDisabled,
  timerLabel,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onStop: () => void;
  primaryDisabled?: boolean;
  stopDisabled: boolean;
  timerLabel?: string;
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
        <button type="button" className="btn btn-ghost" onClick={onStop} disabled={stopDisabled}>
          Stop
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onPrimary}
          disabled={primaryDisabled}
        >
          {primaryLabel}
        </button>
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
