/**
 * Live Translate smoke (no permanent key in this process).
 * Mints via Go → opens Gemini Live WS → sends short PCM → reports real transcript events.
 *
 * Usage (API must be running with mint enabled):
 *   node scripts/live-pcm-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8080';

function log(msg) {
  console.log(msg);
}

async function mint() {
  const res = await fetch(`${API}/api/v1/live-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ sourceLanguage: 'ko', targetLanguage: 'en' }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`mint ${res.status} ${body.code || ''}: ${body.message || JSON.stringify(body)}`);
  }
  return body;
}

/** Prefer LUMA_PCM_PATH (raw s16le mono 16kHz), else Korean TTS, else tone. */
function tonePcm(seconds = 3) {
  const rate = 16000;
  const n = rate * seconds;
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const sample = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.2;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), i * 2);
  }
  return buf;
}

function loadPcm() {
  const path = process.env.LUMA_PCM_PATH;
  if (path && existsSync(path)) {
    return { pcm: readFileSync(path), kind: 'file' };
  }
  const tts = tryKoreanTtsPcm();
  if (tts) return { pcm: tts, kind: 'korean-sapi-tts' };
  return { pcm: tonePcm(3), kind: 'tone-fallback-not-speech' };
}

/** Try Windows SAPI Korean voice → raw PCM via ffmpeg if available. */
function tryKoreanTtsPcm() {
  const ps1 = join(tmpdir(), `luma-tts-${Date.now()}.ps1`);
  const wav = join(tmpdir(), `luma-tts-${Date.now()}.wav`);
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$ko = $voices | Where-Object { $_.Culture.Name -like 'ko*' } | Select-Object -First 1
if (-not $ko) { Write-Error 'NO_KO_VOICE'; exit 2 }
$s.SelectVoice($ko.Name)
$s.SetOutputToWaveFile('${wav.replace(/\\/g, '\\\\')}')
$s.Speak('안녕하세요. 오늘 회의를 시작하겠습니다. 화면을 공유해 주시겠어요?')
$s.Dispose()
Write-Output 'OK'
`;
  writeFileSync(ps1, script, 'utf8');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
    encoding: 'utf8',
  });
  try {
    unlinkSync(ps1);
  } catch {
    /* ignore */
  }
  if (r.status !== 0 || !existsSync(wav)) {
    return null;
  }
  // Prefer ffmpeg resample; else return null and use tone.
  const pcmOut = join(tmpdir(), `luma-pcm-${Date.now()}.s16le`);
  const ff = spawnSync(
    'ffmpeg',
    ['-y', '-i', wav, '-ac', '1', '-ar', '16000', '-f', 's16le', pcmOut],
    { encoding: 'utf8' },
  );
  try {
    unlinkSync(wav);
  } catch {
    /* ignore */
  }
  if (ff.status !== 0 || !existsSync(pcmOut)) {
    return null;
  }
  const pcm = readFileSync(pcmOut);
  try {
    unlinkSync(pcmOut);
  } catch {
    /* ignore */
  }
  return pcm;
}

function chunkPcm(buf, bytesPerChunk = 3200) {
  const chunks = [];
  for (let i = 0; i < buf.length; i += bytesPerChunk) {
    chunks.push(buf.subarray(i, Math.min(i + bytesPerChunk, buf.length)));
  }
  return chunks;
}

async function main() {
  log('1) capabilities');
  const caps = await (await fetch(`${API}/api/v1/capabilities`, { headers: { Origin: 'http://localhost:3000' } })).json();
  log(`   liveTestAllowed=${caps.liveTestAllowed} mintEnabled=${caps.mintEnabled} model=${caps.model}`);
  if (!caps.liveTestAllowed) {
    throw new Error('liveTestAllowed=false — check FREE_TIER_ELIGIBILITY_CONFIRMED and mint flags');
  }

  log('2) mint ephemeral token (no permanent key in this process)');
  const token = await mint();
  log(`   minted api=${token.apiVersion} target=${token.targetLanguageCode} exp=${token.expiresAt}`);

  log('3) prepare PCM');
  const loaded = loadPcm();
  const pcm = loaded.pcm;
  const audioKind = loaded.kind;
  log(`   audioKind=${audioKind} bytes=${pcm.length}`);

  log('4) open Live WebSocket + setup');
  const transcripts = [];
  const errors = [];
  let setupComplete = false;

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(token.websocketUrl);
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(
        new Error(
          `timeout waiting for setup/transcripts (setupComplete=${setupComplete}, msgs=${msgCount}, close=${lastClose})`,
        ),
      );
    }, 45000);

    let msgCount = 0;
    let lastClose = 'none';
    let audioSent = false;

    ws.on('open', () => {
      log('   websocket open');
      const model = token.model.startsWith('models/') ? token.model : `models/${token.model}`;
      const setup = {
        setup: {
          model,
          generationConfig: {
            responseModalities: ['AUDIO'],
            translationConfig: {
              targetLanguageCode: token.targetLanguageCode || 'en',
              echoTargetLanguage: false,
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      log(`   sending setup model=${model}`);
      ws.send(JSON.stringify(setup));
    });

    ws.on('message', async (data, isBinary) => {
      msgCount += 1;
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      log(`   raw message #${msgCount} binary=${Boolean(isBinary)} len=${text.length} preview=${JSON.stringify(text.slice(0, 240))}`);
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.error) {
        errors.push(msg.error);
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`provider error: ${msg.error.message || JSON.stringify(msg.error)}`));
        return;
      }
      if (msg.setupComplete !== undefined && !setupComplete) {
        setupComplete = true;
        log('   setupComplete received — streaming PCM');
        if (!audioSent) {
          audioSent = true;
          const chunks = chunkPcm(pcm);
          for (const chunk of chunks) {
            ws.send(
              JSON.stringify({
                realtimeInput: {
                  audio: {
                    data: chunk.toString('base64'),
                    mimeType: 'audio/pcm;rate=16000',
                  },
                },
              }),
            );
          }
          try {
            ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve(undefined);
          }, 15000);
        }
      }
      const out = msg.serverContent?.outputTranscription?.text;
      const inn = msg.serverContent?.inputTranscription?.text;
      if (out || inn) {
        transcripts.push({
          input: inn,
          output: out,
          finished: Boolean(msg.serverContent?.outputTranscription?.finished),
        });
        log(`   transcript event input=${JSON.stringify(inn || '')} output=${JSON.stringify(out || '')}`);
      }
    });

    ws.on('unexpected-response', (_req, res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        clearTimeout(timeout);
        reject(new Error(`unexpected WS response ${res.statusCode}: ${body.slice(0, 300)}`));
      });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', (code, reason) => {
      lastClose = `${code} ${reason?.toString?.() || ''}`;
      log(`   websocket close ${lastClose}`);
      if (!setupComplete && msgCount === 0) {
        clearTimeout(timeout);
        reject(new Error(`websocket closed before setup (${lastClose})`));
      }
    });
  });

  log('5) result');
  log(`   audioKind=${audioKind}`);
  log(`   setupComplete=${setupComplete}`);
  log(`   transcriptEvents=${transcripts.length}`);
  const english = transcripts.map((t) => t.output).filter(Boolean).join(' ').trim();
  if (!setupComplete) {
    throw new Error('No setupComplete — connection/config failed');
  }
  if (!english) {
    log('   REAL_TRANSLATED_TEXT=none');
    log('   verdict: connection OK but no translated text received (audio may be ineligible or quota/filter)');
    process.exitCode = 2;
    return;
  }
  log(`   REAL_TRANSLATED_TEXT=${JSON.stringify(english)}`);
  log('   verdict: real translated response received from Gemini');
}

main().catch((err) => {
  console.error('FAIL', err.message || err);
  process.exit(1);
});
