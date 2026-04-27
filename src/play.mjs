// Cross-platform audio playback. Windows: PowerShell + System.Windows.Media.MediaPlayer.
// playSequence is sync (blocks). playAsync returns a handle you can cancel
// for interactive auditioning.
//
// Why the seemingly elaborate Open-then-wait dance: MediaPlayer.Open() is async.
// NaturalDuration is invalid until MediaOpened fires. The previous version
// polled NaturalDuration in a tight loop after Play() and frequently fell
// through to the maxSecondsEach fallback (causing several seconds of dead
// air between intro and TTS). Now we wait for MediaOpened explicitly, then
// sleep exactly the clip's duration + a tiny grace.
import { spawnSync, spawn } from 'node:child_process';

function buildPlaybackPS(urls, maxSecondsEach) {
  const arr = `@(${urls.join(',')})`;
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName presentationCore
foreach ($u in ${arr}) {
  $p = New-Object System.Windows.Media.MediaPlayer
  $opened = $false
  $duration = $null
  $p.add_MediaOpened({
    $script:opened = $true
    if ($p.NaturalDuration.HasTimeSpan) { $script:duration = $p.NaturalDuration.TimeSpan }
  })
  $p.Open([uri]$u)
  $p.Volume = 1.0
  # Wait for MediaOpened (max 1.5s).
  $w = 0
  while (-not $script:opened -and $w -lt 1500) {
    Start-Sleep -Milliseconds 30
    $w += 30
  }
  $p.Play()
  if ($script:duration) {
    Start-Sleep -Milliseconds ([int]($script:duration.TotalMilliseconds + 80))
  } else {
    # Couldn't read duration - poll briefly then fall back.
    $waited = 0
    while ($waited -lt ${maxSecondsEach * 1000}) {
      Start-Sleep -Milliseconds 100
      $waited += 100
      if ($p.NaturalDuration.HasTimeSpan -and $p.Position -ge $p.NaturalDuration.TimeSpan) { break }
    }
  }
  $p.Stop()
  $p.Close()
}
`;
}

function escapeUri(p) {
  return `'file:///${p.replace(/\\/g, '/').replace(/'/g, "''")}'`;
}

/**
 * Play one or more audio files (MP3 or WAV) sequentially. Blocks until done.
 *
 * @param {string[]} paths - Absolute file paths
 * @param {object} [opts]
 * @param {number} [opts.maxSecondsEach=12] - Per-file fallback wait when
 *   NaturalDuration can't be read (rare).
 */
export function playSequence(paths, opts = {}) {
  if (!paths || paths.length === 0) return;
  const max = Math.min(opts.maxSecondsEach ?? 12, 30);
  const urls = paths.map(escapeUri);
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS(urls, max)],
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
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS([escapeUri(path)], max)],
    { stdio: 'ignore', windowsHide: true }
  );
  return {
    cancel() { try { child.kill(); } catch {} },
  };
}
