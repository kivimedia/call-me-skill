// Cross-platform audio playback. Windows: PowerShell + System.Windows.Media.MediaPlayer.
// playSequence is sync (blocks). playAsync returns a handle you can cancel
// for interactive auditioning.
import { spawnSync, spawn } from 'node:child_process';

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

/**
 * Play a single audio file in the background. Returns a {cancel} handle so
 * an interactive picker can stop playback when the user moves to the next
 * item. Used by the wizard for intro + voice auditioning.
 */
export function playAsync(path, opts = {}) {
  const max = Math.min(opts.maxSeconds ?? 8, 30);
  const escaped = `'file:///${path.replace(/\\/g, '/').replace(/'/g, "''")}'`;
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName presentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([uri]${escaped})
$p.Volume = 1.0
$p.Play()
$waited = 0
while ($true) {
  Start-Sleep -Milliseconds 200
  $waited += 200
  $dur = $p.NaturalDuration
  if ($dur.HasTimeSpan -and $p.Position -ge $dur.TimeSpan) { break }
  if ($waited -ge ${max * 1000}) { break }
}
$p.Stop()
$p.Close()
`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { stdio: 'ignore', windowsHide: true }
  );
  return {
    cancel() {
      try { child.kill(); } catch {}
    },
  };
}
