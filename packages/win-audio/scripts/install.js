/**
 * Build the .NET capture host on Windows. Non-Windows skips.
 */
const { spawnSync } = require('child_process');

if (process.platform !== 'win32') {
  console.log('@luma/win-audio: skipping host build (non-Windows)');
  process.exit(0);
}

const r = spawnSync(
  'dotnet',
  ['build', 'host/Luma.WinAudioHost.csproj', '-c', 'Release'],
  { cwd: require('path').join(__dirname, '..'), stdio: 'inherit', shell: true },
);
if (r.status !== 0) {
  console.warn('@luma/win-audio: dotnet build failed; process loopback will be unavailable until build succeeds');
  process.exit(0);
}
