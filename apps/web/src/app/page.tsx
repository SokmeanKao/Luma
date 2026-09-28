'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LiveWorkspace } from '../components/LiveWorkspace';
import { DevDemoWorkspace } from '../components/DevDemoWorkspace';
import { getLumaMode, isRealTranslationMode } from '../lib/luma-mode';

function HomeInner() {
  const params = useSearchParams();
  const mode = getLumaMode();
  // Explicit ?demo=1 stays available for automated UI tests only — never the default in live mode.
  const forceDemo = params.get('demo') === '1';

  if (forceDemo) {
    return (
      <DevDemoWorkspace
        onBack={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  if (!isRealTranslationMode(mode)) {
    return (
      <DevDemoWorkspace
        onBack={() => {
          window.location.href = '/';
        }}
      />
    );
  }

  return <LiveWorkspace />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="app-shell">Loading…</div>}>
      <HomeInner />
    </Suspense>
  );
}
