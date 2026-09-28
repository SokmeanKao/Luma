import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Next only auto-loads apps/web/.env*. Load NEXT_PUBLIC_* from the monorepo
 * root .env so one gitignored file drives both Go and the web client.
 * Never copy GEMINI_API_KEY (or other secrets) into the Next process here.
 */
function loadRootPublicEnv(): void {
  const rootEnv = resolve(__dirname, '../../.env');
  if (!existsSync(rootEnv)) return;
  for (const line of readFileSync(rootEnv, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRootPublicEnv();

const nextConfig: NextConfig = {
  transpilePackages: ['@luma/ui', '@luma/translation', '@luma/audio'],
  env: {
    NEXT_PUBLIC_LUMA_MODE: process.env.NEXT_PUBLIC_LUMA_MODE,
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  },
};

export default nextConfig;
