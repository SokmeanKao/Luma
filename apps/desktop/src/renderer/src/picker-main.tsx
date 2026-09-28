import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PickerSourceItem } from '../../shared/ipc';
import './styles.css';

function SourcePicker() {
  const [sources, setSources] = useState<PickerSourceItem[]>([]);

  useEffect(() => {
    if (!window.lumaDesktop) return;
    return window.lumaDesktop.onPickerSources(setSources);
  }, []);

  const screens = sources.filter((s) => s.kind === 'screen');
  const windows = sources.filter((s) => s.kind === 'window');

  return (
    <div className="picker-shell">
      <header className="picker-header">
        <div>
          <h1>Choose app window</h1>
          <p>
            Capture playback from that process only (not the microphone). Text + voice stays safe
            because Luma’s speech is a different process.
          </p>
        </div>
        <button type="button" className="picker-cancel" onClick={() => window.lumaDesktop.cancelPicker()}>
          Cancel
        </button>
      </header>

      {sources.length === 0 ? (
        <p className="picker-empty">Loading sources…</p>
      ) : (
        <div className="picker-scroll">
          {screens.length > 0 ? (
            <section>
              <h2>Screens</h2>
              <div className="picker-grid">
                {screens.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="picker-card"
                    onClick={() => window.lumaDesktop.choosePickerSource(s.id)}
                  >
                    <img src={s.thumbDataUrl} alt="" />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {windows.length > 0 ? (
            <section>
              <h2>Windows</h2>
              <div className="picker-grid">
                {windows.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="picker-card"
                    onClick={() => window.lumaDesktop.choosePickerSource(s.id)}
                  >
                    <img src={s.thumbDataUrl} alt="" />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SourcePicker />
  </StrictMode>,
);
