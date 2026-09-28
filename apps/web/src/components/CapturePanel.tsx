'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BrowserCaptureAdapter,
  CaptureCancelledError,
  NoAudioTrackError,
  createActivityMeter,
  type ActivityMeterHandle,
} from '@luma/audio';

type CaptureStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'ended'
  | 'cancelled'
  | 'no_audio'
  | 'error';

export function CapturePanel() {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('Click Select audio source. Your browser will ask you to share a tab with audio.');
  const [sourceKind, setSourceKind] = useState<'tab' | 'system' | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const meterRef = useRef<ActivityMeterHandle | null>(null);
  const rafRef = useRef<number | null>(null);

  function cleanup() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    meterRef.current?.stop();
    meterRef.current = null;
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    setLevel(0);
  }

  useEffect(() => () => cleanup(), []);

  function startMeterLoop(meter: ActivityMeterHandle) {
    const tick = () => {
      setLevel(meter.getLevel());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function selectSource() {
    cleanup();
    setStatus('requesting');
    setMessage('Waiting for the browser sharing dialog… Enable “Share tab audio” for Teams or YouTube.');
    setSourceKind(null);

    const adapter = new BrowserCaptureAdapter();
    try {
      const result = await adapter.start({
        preferredSourceKind: 'tab',
        onEnded: () => {
          cleanup();
          setStatus('ended');
          setMessage('Capture ended — the shared tab or window was closed or sharing was stopped. Select a source again to continue.');
        },
      });

      stopCaptureRef.current = result.stop;
      setSourceKind(result.sourceKind);
      const meter = createActivityMeter(result.stream);
      meterRef.current = meter;
      startMeterLoop(meter);
      setStatus('active');
      setMessage(
        result.sourceKind === 'system'
          ? 'Capturing system playback. Other apps and notifications may be included. No microphone input. This is capture only — not translation.'
          : 'Capturing selected-tab playback audio. No microphone input. This is capture only — not translation.',
      );
    } catch (err) {
      cleanup();
      if (err instanceof CaptureCancelledError) {
        setStatus('cancelled');
        setMessage('Sharing cancelled. No capture started and no audio is being processed.');
        return;
      }
      if (err instanceof NoAudioTrackError) {
        setStatus('no_audio');
        setMessage(
          'No audio track in the shared source. Choose a browser tab, enable “Share tab audio”, and try again. Screen-only shares without audio cannot be translated.',
        );
        return;
      }
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Capture failed.');
    }
  }

  function stopCapture() {
    cleanup();
    setStatus('idle');
    setSourceKind(null);
    setMessage('Capture stopped. All media tracks were released. Still capture-only — no Gemini connection.');
  }

  const active = status === 'active' || status === 'requesting';
  const barWidth = `${Math.round(level * 100)}%`;

  return (
    <section className="card workspace" style={{ minHeight: 420 }}>
      <div className="live-head">
        <div className="status" role="status">
          <span className="dot" style={status === 'active' ? { background: '#4b9f69', boxShadow: '0 0 0 4px #edf6eb' } : undefined} />
          <span>
            {status === 'active'
              ? 'Capturing playback audio'
              : status === 'requesting'
                ? 'Waiting for browser permission…'
                : status === 'ended'
                  ? 'Source ended'
                  : status === 'cancelled'
                    ? 'Chooser cancelled'
                    : status === 'no_audio'
                      ? 'No audio track'
                      : 'Capture test · no translation'}
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#a07835' }}>Not connected to Gemini</span>
      </div>

      <div style={{ padding: '28px 30px', flex: 1 }}>
        <p style={{ marginTop: 0, color: 'var(--muted-foreground)', fontSize: 14 }}>{message}</p>

        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Audio activity</div>
          <div
            style={{
              height: 14,
              borderRadius: 8,
              background: '#e9eee7',
              overflow: 'hidden',
              border: '1px solid var(--line)',
            }}
            aria-label="Playback audio activity level"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            <div
              style={{
                width: barWidth,
                height: '100%',
                background: status === 'active' ? 'var(--green)' : '#9fb5a1',
                transition: 'width 80ms linear',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 8 }}>
            {sourceKind ? `Source scope: ${sourceKind === 'tab' ? 'tab / window capture' : 'system playback'}` : 'No source selected'}
            {' · '}
            Level {Math.round(level * 100)}%
          </div>
        </div>

        <div className="notice" style={{ marginTop: 28 }}>
          <strong>Manual verification required</strong>
          Confirm in Chrome and Edge: YouTube speech moves this meter; mic speech with silent playback does not;
          another tab’s audio is excluded in tab capture; cancel starts nothing; closing the tab ends capture.
          Record results in docs/feasibility/F04_CAPTURE_EVIDENCE.md.
        </div>
      </div>

      <div className="foot" style={{ gap: 12 }}>
        <button type="button" className="btn" disabled={!active || status === 'requesting'} onClick={stopCapture}>
          ■ &nbsp; Stop capture
        </button>
        <button
          type="button"
          className="btn"
          style={{ background: 'var(--green)', color: 'white', borderColor: 'var(--green)' }}
          disabled={status === 'requesting' || status === 'active'}
          onClick={() => void selectSource()}
        >
          ↗ &nbsp; Select audio source
        </button>
      </div>
    </section>
  );
}
