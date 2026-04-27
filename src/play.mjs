// Cross-platform audio playback. Windows: PowerShell + System.Windows.Media.MediaPlayer.
// Returns when playback finishes (sync wait). Best-effort - if PS errors, logs and returns.
import { spawnSync } from 'node:child_process';

/**
 * Play one or more audio files (MP3 or WAV) sequentially. Blocks until done.
 *
 * @param {string[]} paths - Absolute file paths
 * @param {object} [opts]
 * @param {number} [opts.maxSecondsEach=15] - Per-file max wait
 */
export function playSequence(paths, opts = {}) {
  if (!paths || paths.length === 0) return;
  const max = Math.min(opts.maxSecondsEach ?? 15, 30);
  const escapedPaths = paths.map((p) => p.replace(/'/g, "''")).map((p) => `'file:///${p.replace(/\\/g, '/')}'`);
  const arr = `@(${escapedPaths.join(',')})`;
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName presentationCore
foreach ($u in ${arr}) {
  $p = New-Object System.Windows.Media.MediaPlayer
  $p.Open([uri]$u)
  $p.Volume = 1.0
  $p.Play()
  $waited = 0
  $sleepMs = 200
  while ($true) {
    Start-Sleep -Milliseconds $sleepMs
    $waited += $sleepMs
    $dur = $p.NaturalDuration
    if ($dur.HasTimeSpan -and $p.Position -ge $dur.TimeSpan) { break }
    if ($waited -ge ${max * 1000}) { break }
  }
  $p.Stop()
  $p.Close()
}
`;
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { stdio: 'ignore', timeout: (max * paths.length + 5) * 1000 }
  );
}
