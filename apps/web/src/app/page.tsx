'use client';

import { useState } from 'react';
import { LiveWorkspace } from '../components/LiveWorkspace';
import { DevDemoWorkspace } from '../components/DevDemoWorkspace';

export default function HomePage() {
  const [view, setView] = useState<'live' | 'demo'>('live');

  if (view === 'demo') {
    return <DevDemoWorkspace onBack={() => setView('live')} />;
  }

  return <LiveWorkspace onOpenDemo={() => setView('demo')} />;
}
