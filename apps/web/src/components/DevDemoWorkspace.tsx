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

function clock(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/** Explicit development demo only — sample text, no capture, no Gemini. */
export function DevDemoWorkspace({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<TranscriptUpdate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [showOriginal, setShowOriginal] = useState(true);
  const [fontSize, setFontSize] = useState(19);
  const providerRef = useRef<MockTranslationProvider | null>(null);
  const sessionRef = useRef<ReturnType<typeof createSessionController> | null>(null);
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

  const viewEntries: TranscriptEntryView[] = useMemo(
    () =>
      entries.map((e) => ({
        segmentId: e.segmentId,
        timeLabel: clock(Math.floor(e.captureTimestamp / 1000)),
        originalText: e.originalText,
        translatedText: e.translatedText,
        showOriginal,
        fontSize,
        final: e.final,
      })),
    [entries, showOriginal, fontSize],
  );

  const active = state === 'listening' || state === 'paused';

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
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en', sessionId: 'dev-demo' });
    await provider.connect(
      { mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en', sessionId: 'dev-demo' },
      'demo',
    );
    // Ensure generation matches the just-started session before the first sample.
    provider.startDemo();
    setEntries(session.listTranscript());
  }

  return (
    <div className="app" data-demo-ready="true">
      <aside>
        <Brand />
        <div className="nav">◉ &nbsp; Dev demo</div>
        <div className="side-note">
          <button type="button" className="btn" style={{ width: '100%' }} onClick={onBack}>
            ← Back to live app
          </button>
        </div>
      </aside>
      <main>
        <div className="top">
          <span>Development demo</span>
          <StatusPill demo>Sample subtitles only · no capture · no Gemini</StatusPill>
        </div>
        <div className="heading">
          <div>
            <h1>Demo samples</h1>
            <p>Not a substitute for live translation.</p>
          </div>
        </div>
        <div className="grid">
          <section className="card settings">
            <div className="eyebrow">DEV ONLY</div>
            <h2>Simulated transcript</h2>
            <SourceCard name="Demo source" detail="No browser capture" icon="D" />
            <p className="real-disabled">Mock provider for UI/tests. Live app is the default product flow.</p>
          </section>
          <div>
            <section className={`card workspace${state === 'listening' ? ' running' : ''}`}>
              <div className="live-head">
                <div className="status" role="status">
                  <span className="dot" />
                  <span>{state === 'listening' ? 'Demo running' : 'Demo idle'}</span>
                </div>
                <label style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />{' '}
                  Original
                </label>
              </div>
              <div className="transcript">
                <TranscriptList entries={viewEntries} emptyMessage="Start demo for sample rows." />
              </div>
            </section>
            <SessionControls
              timerLabel={clock(seconds)}
              primaryLabel={state === 'listening' ? 'Pause' : state === 'paused' ? 'Resume' : 'Start demo'}
              onPrimary={() => void onPrimary()}
              onStop={() => {
                sessionRef.current?.stop();
                void providerRef.current?.close();
              }}
              stopDisabled={!active}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
