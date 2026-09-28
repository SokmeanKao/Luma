import { useEffect, useRef, useState } from 'react';
import { Brand } from '@luma/ui';
import type { FloatTranscriptSnapshot } from '../../shared/ipc';
import { Button } from '@web/components/ui/button';

export function FloatApp() {
  const [snapshot, setSnapshot] = useState<FloatTranscriptSnapshot>({ entries: [] });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.lumaDesktop) return;
    return window.lumaDesktop.onTranscriptUpdate(setSnapshot);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [snapshot.entries]);

  const entries = snapshot.entries;

  return (
    <div className="float-shell">
      <div className="float-drag">
        <Brand compact />
        <div className="float-status">{snapshot.statusLabel ?? 'idle'}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void window.lumaDesktop?.closeFloat()}
        >
          Close
        </Button>
      </div>
      <div className="float-scroll" ref={scrollerRef}>
        {entries.length === 0 ? (
          <p className="float-empty">Subtitles appear here during a session.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={e.final ? 'float-line' : 'float-line float-line--partial'}>
              {e.translatedText || '…'}
              {e.originalText ? <div className="float-original">{e.originalText}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
