// Audio playback via WPF MediaPlayer (System.Windows.Media.MediaPlayer).
// Routes through Windows Media Foundation -> WASAPI = the SAME audio path
// modern apps (YouTube, browsers, Spotify) use. Honors the modern WASAPI
// default playback device set in Settings > System > Sound.
//
// Why not MCI (winmm.dll mciSendString)?
//   MCI is a 1991 Windows API that uses the legacy "Wave Mapper" device
//   routing, which is independent of the modern WASAPI default device.
//   On machines with virtual audio cables (Voice.ai, NVIDIA Broadcast,
//   VB-Audio CABLE, OBS, Discord, etc.) MCI often routes to a dead
//   virtual sink while WASAPI plays to real speakers. Result: chime +
//   TTS go into the void, user hears nothing, system reports success.
//   Documented case: Ziv's machine, 2026-05-26 - YouTube + kmboards
//   audio worked while call-me-skill MCI playback was silent.
//
// Per-clip maxMs cap: ElevenLabs SFX often pads the trailing audio with
// silence (a 2.0s file might have 0.7s of chime then 1.3s of silence).
// Pass {path, maxMs: 1200} to cut the silence and start the next clip on
// time. TTS clips don't have padding so leave maxMs unset.
import { spawnSync, spawn } from 'node:child_process';

function escapeForPS(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '``').replace(/'/g, "''");
}

function normalizeQueue(items) {
  return items.map((it) => (typeof it === 'string' ? { path: it } : it));
}

function buildPlaybackPS(items) {
  const lines = items.map((it) => {
    const psPath = escapeForPS(it.path);
    if (it.maxMs && it.maxMs > 0) {
      // Capped playback: open + play + sleep for maxMs + close.
      return `
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([uri]'${psPath}')
$p.Play()
Start-Sleep -Milliseconds ${Math.floor(it.maxMs)}
$p.Stop()
$p.Close()
`;
    }
    // Uncapped playback: wait for MediaOpened to learn duration, then
    // sleep for that long. MediaPlayer.NaturalDuration becomes valid
    // shortly after Open() - poll briefly. Fallback to 8s if unknown.
    return `
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([uri]'${psPath}')
$deadline = (Get-Date).AddSeconds(3)
while (-not $p.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 40
}
$secs = if ($p.NaturalDuration.HasTimeSpan) { [Math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds + 0.4) } else { 8 }
$p.Play()
Start-Sleep -Seconds $secs
$p.Stop()
$p.Close()
`;
  }).join('');
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName PresentationCore
${lines}
`;
}

/**
 * Play queued items sequentially. Blocks until done.
 *
 * @param {Array<string | {path: string, maxMs?: number}>} items - File paths
 *   or {path, maxMs} objects. maxMs caps playback for silence-padded clips.
 * @param {object} [opts]
 * @param {number} [opts.maxSecondsTotal=60] - Hard timeout for the queue.
 */
export function playSequence(items, opts = {}) {
  if (!items || items.length === 0) return;
  const max = Math.min(opts.maxSecondsTotal ?? 60, 120);
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS(normalizeQueue(items))],
    { stdio: 'ignore', timeout: max * 1000 }
  );
}

/**
 * Play a single audio file in the background. Returns a {cancel} handle.
 * Used by the wizard for intro + voice auditioning.
 */
export function playAsync(path) {
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS([{ path }])],
    { stdio: 'ignore', windowsHide: true }
  );
  return { cancel() { try { child.kill(); } catch {} } };
}
