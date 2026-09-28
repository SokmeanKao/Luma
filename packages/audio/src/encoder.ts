export function downmixToMono(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) {
    return new Float32Array(interleaved);
  }
  const frames = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += interleaved[i * channels + c] ?? 0;
    }
    mono[i] = sum / channels;
  }
  return mono;
}

export function pcmChunkDurationMs(sampleCount: number, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return (sampleCount / sampleRate) * 1000;
}
