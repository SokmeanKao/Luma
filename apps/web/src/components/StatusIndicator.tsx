'use client';

import {
  AlertCircleIcon,
  AudioLinesIcon,
  CirclePauseIcon,
  LoaderCircleIcon,
  SparklesIcon,
} from 'lucide-react';

export type StatusTone = 'idle' | 'listening' | 'paused' | 'error' | 'connecting' | 'ready';

/** Compact listening wave — reacts to capture activity when listening. */
export function StatusIndicator({
  tone,
  activity = 0,
}: {
  tone: StatusTone;
  /** 0–1 capture level while listening */
  activity?: number;
}) {
  if (tone === 'listening') {
    const base = 0.28 + Math.min(1, Math.max(0, activity)) * 0.72;
    const scales = [0.55, 1, 0.7, 0.9].map((m, i) =>
      Math.min(1, Math.max(0.22, base * m * (0.85 + ((i * 17) % 10) * 0.02))),
    );
    return (
      <span className="status-wave" data-active={activity > 0.08 ? 'true' : undefined}>
        {scales.map((s, i) => (
          <span
            key={i}
            className="status-wave-bar"
            style={{ ['--bar-scale' as string]: s }}
          />
        ))}
      </span>
    );
  }

  if (tone === 'paused') {
    return <CirclePauseIcon className="status-icon status-icon--paused size-3.5" />;
  }
  if (tone === 'connecting') {
    return <LoaderCircleIcon className="status-icon status-icon--connecting size-3.5 animate-spin" />;
  }
  if (tone === 'error') {
    return <AlertCircleIcon className="status-icon status-icon--error size-3.5" />;
  }
  if (tone === 'ready') {
    return <SparklesIcon className="status-icon status-icon--ready size-3.5" />;
  }
  return <AudioLinesIcon className="status-icon status-icon--idle size-3.5" />;
}

export function statusToneFromState(
  state: string,
  hasSource: boolean,
): StatusTone {
  switch (state) {
    case 'listening':
      return 'listening';
    case 'paused':
      return 'paused';
    case 'connecting':
    case 'reconnecting':
    case 'selecting':
      return 'connecting';
    case 'error':
    case 'quota_exhausted':
      return 'error';
    default:
      return hasSource ? 'ready' : 'idle';
  }
}
