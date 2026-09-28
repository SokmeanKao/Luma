export function shouldDisplayTranslation(opts: {
  selectedSource: string;
  detectedSource?: string;
}): boolean {
  if (opts.detectedSource === undefined || opts.detectedSource === '') {
    return true;
  }
  return opts.detectedSource === opts.selectedSource;
}
