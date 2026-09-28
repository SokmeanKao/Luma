import { useCallback, useEffect, useState } from 'react';
import { LiveWorkspace } from '@web/components/LiveWorkspace';
import { Button } from '@web/components/ui/button';
import type { FloatTranscriptSnapshot } from '../../shared/ipc';

export function App() {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [floatOpen, setFloatOpen] = useState(false);

  useEffect(() => {
    if (!window.lumaDesktop) return;
    void window.lumaDesktop.getAlwaysOnTop().then(setAlwaysOnTop);
    return window.lumaDesktop.onFloatClosed(() => setFloatOpen(false));
  }, []);

  const onSnapshot = useCallback((snapshot: FloatTranscriptSnapshot) => {
    window.lumaDesktop?.publishTranscript(snapshot);
  }, []);

  async function toggleFloat() {
    if (!window.lumaDesktop) return;
    if (floatOpen) {
      await window.lumaDesktop.closeFloat();
      setFloatOpen(false);
      return;
    }
    await window.lumaDesktop.openFloat();
    setFloatOpen(true);
  }

  async function toggleAlwaysOnTop() {
    if (!window.lumaDesktop) return;
    const next = !alwaysOnTop;
    await window.lumaDesktop.setAlwaysOnTop(next);
    setAlwaysOnTop(next);
  }

  return (
    <LiveWorkspace
      onTranscriptSnapshot={onSnapshot}
      headerExtra={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => void toggleFloat()}>
            {floatOpen ? 'Close float' : 'Floating subtitles'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void toggleAlwaysOnTop()}
            title="Applies to the floating subtitle window"
          >
            Always on top: {alwaysOnTop ? 'On' : 'Off'}
          </Button>
        </>
      }
    />
  );
}
