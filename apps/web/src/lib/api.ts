export type LanguageInfo = {
  code: string;
  name: string;
};

export type SupportedPair = {
  source: string;
  target: string;
  filterStatus: string;
  notes?: string;
};

export type Capabilities = {
  languages: LanguageInfo[];
  supportedPairs: SupportedPair[];
  allDistinctPairsAllowed?: boolean;
  defaultSourceLanguage: string;
  defaultTargetLanguage: string;
  sourceLanguages: string[];
  targetLanguages: string[];
  providerAvailable: boolean;
  modelConfigured: boolean;
  mintEnabled: boolean;
  freeTierEligibilityConfirmed: boolean;
  model?: string;
  liveTestAllowed: boolean;
  missingEligibilityEvidence?: string[];
  languageFilterStatus: string;
  pairVerificationNote?: string;
};

export type LiveTokenResponse = {
  temporaryCredential: string;
  expiresAt: string;
  model: string;
  apiVersion: string;
  websocketUrl: string;
  targetLanguageCode: string;
  echoTargetLanguage: boolean;
  setupLocked: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8080';

export async function fetchCapabilities(): Promise<Capabilities> {
  const res = await fetch(`${API_BASE}/api/v1/capabilities`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`capabilities ${res.status}`);
  return (await res.json()) as Capabilities;
}

export async function fetchLiveToken(opts: {
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<LiveTokenResponse> {
  const res = await fetch(`${API_BASE}/api/v1/live-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceLanguage: opts.sourceLanguage,
      targetLanguage: opts.targetLanguage,
    }),
    cache: 'no-store',
  });
  const body = await res.json();
  if (!res.ok) {
    const code = body?.code ?? 'UNKNOWN';
    const message = body?.message ?? `live-token ${res.status}`;
    throw Object.assign(new Error(message), { code });
  }
  return body as LiveTokenResponse;
}
