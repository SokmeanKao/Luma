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
};

export function TranscriptPanel({
  entries,
  empty,
  fontSize,
}: {
  entries: TranscriptEntryView[];
  empty: ReactNode;
  fontSize: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, pinned]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 48;
    setPinned(atBottom);
    setShowJump(!atBottom && entries.length > 0);
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
        {entries.length === 0 ? empty : null}
        {entries.map((entry) => (
          <article
            key={entry.segmentId}
            className={`subtitle-row${entry.final ? ' is-final' : ' is-provisional'}`}
          >
            <time className="subtitle-time" dateTime={entry.timeLabel}>
              {entry.timeLabel}
            </time>
            <div className="subtitle-body">
              {entry.showOriginal && entry.originalText ? (
                <p className="subtitle-ko" lang="ko">
                  {entry.originalText}
                </p>
              ) : null}
              <p className="subtitle-en" lang="en">
                {entry.translatedText}
                {!entry.final ? <span className="provisional-mark"> · updating</span> : null}
              </p>
            </div>
          </article>
        ))}
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
  return <TranscriptPanel entries={entries} empty={<div className="transcript-empty">{emptyMessage}</div>} fontSize={entries[0]?.fontSize ?? 20} />;
}
