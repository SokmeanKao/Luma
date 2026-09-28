'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LiveWorkspace } from '../components/LiveWorkspace';
import { DevDemoWorkspace } from '../components/DevDemoWorkspace';

function HomeInner() {
  const params = useSearchParams();
  const demo = params.get('demo') === '1';

  if (demo) {
    return <DevDemoWorkspace onBack={() => { window.location.href = '/'; }} />;
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
