const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hostCandidates = [
  // Packaged Electron: extraResources → resources/win-audio-host/
  ...(process.resourcesPath
    ? [path.join(process.resourcesPath, 'win-audio-host', 'luma-win-audio-host.exe')]
    : []),
  path.join(__dirname, 'host', 'bin', 'Release', 'net10.0-windows', 'luma-win-audio-host.exe'),
  path.join(__dirname, 'host', 'bin', 'Debug', 'net10.0-windows', 'luma-win-audio-host.exe'),
];

function resolveHost() {
  for (const p of hostCandidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isSupported() {
  if (process.platform !== 'win32') return false;
  const build = Number(os.release().split('.')[2] || 0);
  // Windows 10/11 report 10.0.build; require 20348+ when detectable.
  if (build > 0 && build < 20348) return false;
  return Boolean(resolveHost());
}

function hwndToPid(hwnd) {
  // Host resolves hwnd via --hwnd; for sync JS API use child_process sync is heavy.
  // Prefer passing hwnd to start instead. Keep method for native parity.
  const host = resolveHost();
  if (!host) throw new Error('luma-win-audio-host.exe not found — run pnpm --filter @luma/win-audio build');
  // Not used in host-first path; Electron main will pass hwnd to start.
  return 0;
}

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let child = null;
/** @type {((pcm: Buffer, meta: {sampleRate:number, channels:number}) => void) | null} */
let pcmHandler = null;
/** @type {(() => void) | null} */
let endedHandler = null;

function onPcm(cb) {
  pcmHandler = cb;
  return () => {
    if (pcmHandler === cb) pcmHandler = null;
  };
}

function onEnded(cb) {
  endedHandler = cb;
  return () => {
    if (endedHandler === cb) endedHandler = null;
  };
}

function stop() {
  if (!child) return;
  try {
    child.stdin.write('STOP\n');
  } catch {
    /* ignore */
  }
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
}

/**
 * @param {{ pid?: number, hwnd?: number, includeProcessTree?: boolean }} opts
 */
function startProcessLoopback(opts) {
  stop();
  const host = resolveHost();
  if (!host) throw new Error('luma-win-audio-host.exe not found — run pnpm --filter @luma/win-audio build');
  if (!isSupported()) throw new Error('Process loopback requires Windows build 20348+');

  const args = [];
  if (opts.hwnd) args.push('--hwnd', String(opts.hwnd));
  else if (opts.pid) args.push('--pid', String(opts.pid));
  else throw new Error('pid or hwnd required');

  child = spawn(host, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let header = null;
  /** @type {Buffer} */
  let pending = Buffer.alloc(0);

  child.stderr.on('data', (d) => {
    process.stderr.write(`[win-audio-host] ${d}`);
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (code && code !== 0) {
      console.error(`[win-audio-host] exited code=${code} signal=${signal || ''}`);
    }
    endedHandler?.();
  });

  child.stdout.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (!header) {
      if (pending.length < 12) return;
      header = {
        sampleRate: pending.readUInt32LE(0),
        channels: pending.readUInt16LE(4),
      };
      pending = pending.subarray(12);
    }
    while (pending.length >= 4) {
      const len = pending.readUInt32LE(0);
      if (pending.length < 4 + len) break;
      const pcm = pending.subarray(4, 4 + len);
      pending = pending.subarray(4 + len);
      pcmHandler?.(pcm, header);
    }
  });
}

function listWindows() {
  const host = resolveHost();
  if (!host) throw new Error('luma-win-audio-host.exe not found — run pnpm --filter @luma/win-audio build');
  const r = spawnSync(host, ['--list-windows'], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || `list-windows failed (${r.status})`);
  }
  const raw = (r.stdout || '').trim();
  if (!raw) return [];
  /** @type {Array<{ hwnd: number, pid: number, title: string, processName?: string }>} */
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Capture PNG data-URL thumbnails for HWNDs via PrintWindow.
 * @param {number[]} hwnds
 * @returns {Record<string, string | null>}
 */
function captureThumbnails(hwnds) {
  const host = resolveHost();
  if (!host) throw new Error('luma-win-audio-host.exe not found — run pnpm --filter @luma/win-audio build');
  const unique = [...new Set(hwnds.filter((h) => Number.isFinite(h) && h > 0).map((h) => Math.trunc(h)))];
  if (unique.length === 0) return {};
  const r = spawnSync(host, ['--thumbnails', ...unique.map(String)], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || `thumbnails failed (${r.status})`);
  }
  const raw = (r.stdout || '').trim();
  if (!raw) return {};
  /** @type {Record<string, string | null>} */
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

module.exports = {
  isSupported,
  hwndToPid,
  startProcessLoopback,
  stop,
  onPcm,
  onEnded,
  resolveHost,
  listWindows,
  captureThumbnails,
};
