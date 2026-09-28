import type { ReactNode } from 'react';

export function Brand({ tagline = 'UNDERSTAND IN THE MOMENT' }: { tagline?: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: -1, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span
          aria-hidden
          style={{
            color: 'white',
            background: 'var(--green)',
            borderRadius: 12,
            width: 35,
            textAlign: 'center',
            fontSize: 24,
          }}
        >
          ≈
        </span>
        luma
      </div>
      <div style={{ fontSize: 10, letterSpacing: 1.7, color: 'var(--muted)', margin: '7px 0 42px' }}>{tagline}</div>
    </div>
  );
}

export function StatusPill({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  return (
    <span
      className={demo ? 'demo-pill' : undefined}
      style={{
        border: demo ? '1px solid #eee2c9' : '1px solid var(--line)',
        padding: '6px 11px',
        borderRadius: 30,
        background: demo ? '#faf4e8' : 'white',
        color: demo ? '#a07835' : 'inherit',
      }}
    >
      {children}
    </span>
  );
}

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
    <div
      style={{
        padding: 15,
        background: '#f6f8f5',
        border: '1px solid var(--line)',
        borderRadius: 10,
        margin: '12px 0',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontWeight: 650 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#e9e7fb',
            color: '#6253ac',
            display: 'grid',
            placeItems: 'center',
            fontSize: 17,
          }}
        >
          {icon}
        </span>
        <span>{name}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 9 }}>{detail}</div>
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
};

export function TranscriptList({
  entries,
  emptyMessage,
}: {
  entries: TranscriptEntryView[];
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '90px 20px', textAlign: 'center', color: 'var(--muted)' }}>{emptyMessage}</div>
    );
  }
  return (
    <>
      {entries.map((entry, index) => (
        <div
          key={entry.segmentId}
          style={{ display: 'grid', gridTemplateColumns: '43px 1fr', gap: 15, marginBottom: 26 }}
        >
          <span style={{ fontSize: 11, color: '#98a199', paddingTop: 5, fontVariantNumeric: 'tabular-nums' }}>
            {entry.timeLabel}
          </span>
          <div>
            {entry.showOriginal && entry.originalText ? (
              <div style={{ color: '#8b948d', fontSize: 13, marginBottom: 7 }} lang="ko">
                {entry.originalText}
              </div>
            ) : null}
            <div
              style={{
                fontSize: entry.fontSize,
                lineHeight: 1.55,
                letterSpacing: -0.2,
                color: index === entries.length - 1 ? 'var(--green)' : undefined,
              }}
            >
              {entry.translatedText}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function SessionControls({
  timerLabel,
  hint,
  primaryLabel,
  onPrimary,
  onStop,
  stopDisabled,
}: {
  timerLabel: string;
  hint: string;
  primaryLabel: string;
  onPrimary: () => void;
  onStop: () => void;
  stopDisabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 19, flexWrap: 'wrap', gap: 10 }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--muted)' }}>
        Session <strong style={{ color: 'var(--ink)' }}>{timerLabel}</strong> <span>{hint}</span>
      </div>
      <div style={{ display: 'flex', gap: 9 }}>
        <button
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
          style={{
            border: '1px solid var(--line)',
            background: 'white',
            padding: '10px 16px',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          ■ &nbsp; Stop
        </button>
        <button
          type="button"
          onClick={onPrimary}
          style={{
            border: '1px solid var(--green)',
            background: 'var(--green)',
            color: 'white',
            padding: '10px 16px',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
