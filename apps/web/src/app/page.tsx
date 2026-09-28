'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brand,
  SessionControls,
  SourceCard,
  StatusPill,
  TranscriptList,
  type TranscriptEntryView,
} from '@luma/ui';
import {
  createSessionController,
  MockTranslationProvider,
  type SessionState,
  type TranscriptUpdate,
} from '@luma/translation';
import { CapturePanel } from '../components/CapturePanel';

type UiMode = 'demo' | 'capture' | 'live';

type SourceKey = 'teams' | 'youtube' | 'system';

const SOURCE_META: Record<SourceKey, { name: string; icon: string; detail: string; note: string }> = {
  teams: {
    name: 'Microsoft Teams',
    icon: 'T',
    detail: 'Browser tab · demo source',
    note: 'Only the tab you select. Your microphone is never requested.',
  },
  youtube: {
    name: 'YouTube',
    icon: '▶',
    detail: 'Browser tab · demo source',
    note: 'Only the tab you select. Your microphone is never requested.',
  },
  system: {
    name: 'Windows playback',
    icon: '▣',
    detail: 'System audio · demo source',
    note: 'Includes system playback and potentially other apps. No microphone input.',
  },
};

function clock(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function statusLabel(state: SessionState): string {
  switch (state) {
    case 'listening':
      return 'Translating · demo';
    case 'paused':
      return 'Paused';
    case 'stopped':
      return 'Session stopped';
    default:
      return 'Ready to translate';
  }
}

function pillCopy(mode: UiMode): { demo: boolean; text: string } {
  if (mode === 'demo') return { demo: true, text: 'Interactive demo · no audio captured' };
  if (mode === 'capture') return { demo: true, text: 'Capture test · no Gemini / no translation' };
  return { demo: false, text: 'Live mode · blocked until gates pass' };
}

export default function HomePage() {
  const [mode, setMode] = useState<UiMode>('demo');
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<TranscriptUpdate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [source, setSource] = useState<SourceKey>('teams');
  const [showOriginal, setShowOriginal] = useState(true);
  const [fontSize, setFontSize] = useState(19);
  const [dialogOpen, setDialogOpen] = useState(false);
  const providerRef = useRef<MockTranslationProvider | null>(null);
  const sessionRef = useRef<ReturnType<typeof createSessionController> | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    const provider = new MockTranslationProvider();
    providerRef.current = provider;
    const session = createSessionController({
      onUpdate: () => setEntries(session.listTranscript()),
      onStateChange: setState,
    });
    sessionRef.current = session;
    provider.on('transcript', (payload) => {
      const update = payload as TranscriptUpdate;
      session.acceptTranscript({
        ...update,
        captureTimestamp: secondsRef.current * 1000,
        generationId: session.getGenerationId(),
      });
    });
    return () => {
      void provider.close();
    };
  }, []);

  useEffect(() => {
    if (state !== 'listening') return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const viewEntries: TranscriptEntryView[] = useMemo(
    () =>
      entries.map((e) => ({
        segmentId: e.segmentId,
        timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
        originalText: e.originalText,
        translatedText: e.translatedText,
        showOriginal,
        fontSize,
      })),
    [entries, showOriginal, fontSize],
  );

  const meta = SOURCE_META[source];
  const active = state === 'listening' || state === 'paused';
  const pill = pillCopy(mode);

  function switchMode(next: UiMode) {
    if (next === 'live') return;
    if (active) {
      void onStop();
    }
    setMode(next);
  }

  async function onPrimary() {
    const session = sessionRef.current;
    const provider = providerRef.current;
    if (!session || !provider) return;

    if (state === 'listening') {
      session.pause();
      return;
    }
    if (state === 'paused') {
      session.resume();
      return;
    }

    setSeconds(0);
    setEntries([]);
    session.start({
      mode: 'demo',
      sourceLanguage: 'ko',
      targetLanguage: 'en',
      sessionId: 'web-demo',
    });
    await provider.connect(
      { mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en', sessionId: 'web-demo' },
      'demo',
    );
    provider.startDemo();
  }

  async function onStop() {
    sessionRef.current?.stop();
    await providerRef.current?.close();
    providerRef.current = new MockTranslationProvider();
    const provider = providerRef.current;
    const session = sessionRef.current;
    if (session) {
      provider.on('transcript', (payload) => {
        const update = payload as TranscriptUpdate;
        session.acceptTranscript({
          ...update,
          generationId: session.getGenerationId(),
        });
      });
    }
  }

  function onClear() {
    sessionRef.current?.clear();
    setEntries([]);
  }

  const primaryLabel =
    state === 'listening' ? 'Ⅱ  Pause' : state === 'paused' ? '▶  Resume demo' : '▶  Start demo';

  return (
    <div className="app">
      <aside>
        <Brand />
        <div className="nav">◉ &nbsp; Live translation</div>
        <div className="side-note">
          <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>Your microphone stays yours.</div>
          Translate what you hear.
          <br />
          Keep your conversation flowing.
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '16px 0' }} />
          Stage tracker · demo ≠ live
        </div>
      </aside>
      <main>
        <div className="top">
          <span>Workspace / Live translation</span>
          <StatusPill demo={pill.demo}>{pill.text}</StatusPill>
        </div>
        <div className="heading">
          <div>
            <h1>Every word, a little clearer.</h1>
            <p>Live English subtitles for meetings and videos.</p>
          </div>
          <div className="mode" aria-label="Session mode" style={{ display: 'flex', background: '#e9eee7', borderRadius: 9, padding: 4 }}>
            {(
              [
                ['demo', 'Demo'],
                ['capture', 'Capture test'],
                ['live', 'Live'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === 'live'}
                onClick={() => switchMode(id)}
                style={{
                  background: mode === id ? '#fff' : 'none',
                  border: 0,
                  padding: '7px 14px',
                  color: mode === id ? 'var(--ink)' : 'var(--muted)',
                  borderRadius: 6,
                  boxShadow: mode === id ? '0 2px 5px #00000009' : undefined,
                  fontWeight: 600,
                }}
                title={id === 'live' ? 'Blocked until capture evidence and Gemini gates pass' : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'capture' ? (
          <div className="grid">
            <section className="card settings">
              <div className="eyebrow">STAGE 2 · CAPTURE ONLY</div>
              <h2>Prove browser playback audio</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
                Opens the real browser sharing dialog. Does not call Gemini. Does not show demo subtitles.
              </p>
              <div className="notice">
                <strong>◌ &nbsp; Playback audio only</strong>
                Select a Teams or YouTube tab and enable Share tab audio. Your microphone is never requested.
              </div>
              <p className="real-disabled">
                Live translation stays disabled until F-01–F-03 and F-04 evidence are recorded.
              </p>
            </section>
            <CapturePanel />
          </div>
        ) : (
          <div className="grid">
            <section className="card settings">
              <div className="eyebrow">SET UP YOUR SESSION</div>
              <h2>What are you listening to?</h2>
              <SourceCard name={meta.name} detail={meta.detail} icon={meta.icon} />
              <button
                type="button"
                className="btn wide"
                disabled={active}
                onClick={() => setDialogOpen(true)}
              >
                ↗ &nbsp; Select audio source
              </button>
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '24px 0' }} />
              <label className="field" htmlFor="language">
                Translate from
              </label>
              <select id="language" className="field-control" disabled={active} defaultValue="ko">
                <option value="ko">Korean</option>
              </select>
              <div style={{ textAlign: 'center', color: '#9ba69d', margin: 8 }}>↓</div>
              <label className="field" htmlFor="target">
                Translate into
              </label>
              <select id="target" className="field-control" disabled defaultValue="en">
                <option value="en">English</option>
              </select>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12, marginTop: 19 }}>
                <input type="checkbox" checked disabled readOnly />
                <span>
                  Only translate the selected language
                  <br />
                  <span style={{ color: 'var(--muted)' }}>Other languages are skipped.</span>
                </span>
              </label>
              <div className="notice">
                <strong>◌ &nbsp; Playback audio only</strong>
                {meta.note}
              </div>
              <p className="real-disabled">
                This is demo mode with sample subtitles. Capture test is a separate mode. Live is blocked.
              </p>
            </section>
            <div>
              <section className={`card workspace${state === 'listening' ? ' running' : ''}`} id="workspace">
                <div className="live-head">
                  <div className="status" role="status">
                    <span className="dot" />
                    <span>{statusLabel(state)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={showOriginal}
                        onChange={(e) => setShowOriginal(e.target.checked)}
                      />{' '}
                      Original
                    </label>
                    <button
                      type="button"
                      className="btn"
                      style={{ border: 0, background: 'none', color: 'var(--muted)', padding: 5 }}
                      aria-label="Increase subtitle font size"
                      onClick={() => setFontSize((f) => (f >= 25 ? 17 : f + 2))}
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ border: 0, background: 'none', color: 'var(--muted)', padding: 5 }}
                      onClick={onClear}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div
                  className="transcript"
                  ref={transcriptRef}
                  role="log"
                  aria-label="Translation transcript"
                  aria-live="polite"
                >
                  <TranscriptList
                    entries={viewEntries}
                    emptyMessage="Demo transcript empty. Start the demo for sample translations — not live Gemini."
                  />
                </div>
                <div className="foot">
                  <span>Korean → English · demo transcript</span>
                  <div className="wave" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </section>
              <SessionControls
                timerLabel={clock(seconds)}
                hint={
                  state === 'listening'
                    ? '· Simulated audio stream'
                    : state === 'paused'
                      ? '· No audio sent'
                      : '· Ready when you are'
                }
                primaryLabel={primaryLabel}
                onPrimary={() => void onPrimary()}
                onStop={() => void onStop()}
                stopDisabled={!active}
              />
              <div className="notice" style={{ background: 'transparent', border: '1px dashed #d6dfd3' }}>
                <strong>Keep your meeting in focus.</strong>
                Share a presentation window in Teams while this app translates meeting audio. Sharing your entire
                screen may make these subtitles visible to others.
              </div>
            </div>
          </div>
        )}
      </main>

      {dialogOpen && mode === 'demo' ? (
        <dialog open onClose={() => setDialogOpen(false)}>
          <div className="eyebrow">AUDIO SOURCE</div>
          <h2 style={{ fontSize: 23, marginTop: 8 }}>Choose what to translate</h2>
          <p>
            This is a <strong>demo</strong> source selector. Switch to <strong>Capture test</strong> for the real
            browser sharing dialog (still no Gemini).
          </p>
          <div className="choices">
            {(Object.keys(SOURCE_META) as SourceKey[])
              .filter((key) => key !== 'system')
              .map((key) => (
                <button
                  key={key}
                  type="button"
                  className="choice"
                  onClick={() => {
                    setSource(key);
                    setDialogOpen(false);
                  }}
                >
                  <strong>{SOURCE_META[key].name}</strong>
                  <span>{SOURCE_META[key].detail}</span>
                </button>
              ))}
          </div>
          <button type="button" className="btn wide" onClick={() => setDialogOpen(false)}>
            Cancel
          </button>
        </dialog>
      ) : null}
    </div>
  );
}
