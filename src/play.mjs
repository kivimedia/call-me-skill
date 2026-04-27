// Audio playback via Windows Multimedia (winmm.dll mciSendString).
//
// Why not MediaPlayer (System.Windows.Media): events like MediaOpened need a
// WPF Dispatcher / message pump, which PowerShell -Command scripts don't run.
// Without it, NaturalDuration never populates and we end up sleeping the full
// fallback per clip - causing seconds of dead air between intro and TTS.
//
// mciSendString with the `wait` flag is synchronous - returns only when
// playback completes. No events, no polling, no guesswork. Native MP3
// support since Windows XP via the `mpegvideo` device type.
import { spawnSync, spawn } from 'node:child_process';

function buildPlaybackPS(paths) {
  // Build a PS script that opens, plays-with-wait, closes each file in turn.
  // Aliases are cms0, cms1, cms2... so they don't collide with anything else.
  const psPaths = paths.map((p) => p.replace(/\\/g, '\\\\').replace(/`/g, '``').replace(/"/g, '\\"'));
  const lines = psPaths.map((p, i) => {
    const alias = `cms${i}`;
    return `
$null = [W.MCI]::mciSendString('open "${p}" alias ${alias}', $null, 0, [IntPtr]::Zero)
$null = [W.MCI]::mciSendString('play ${alias} wait', $null, 0, [IntPtr]::Zero)
$null = [W.MCI]::mciSendString('close ${alias}', $null, 0, [IntPtr]::Zero)
`;
  }).join('');
  return `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Name MCI -Namespace W -MemberDefinition '[System.Runtime.InteropServices.DllImport("winmm.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)] public static extern int mciSendString(string command, System.Text.StringBuilder buffer, int bufferSize, System.IntPtr hWndCallback);'
${lines}
`;
}

/**
 * Play one or more audio files (MP3 or WAV) sequentially. Blocks until done.
 *
 * @param {string[]} paths - Absolute file paths
 * @param {object} [opts]
 * @param {number} [opts.maxSecondsTotal=60] - Hard timeout for the whole queue
 *   in case a file is corrupt and mci hangs.
 */
export function playSequence(paths, opts = {}) {
  if (!paths || paths.length === 0) return;
  const max = Math.min(opts.maxSecondsTotal ?? 60, 120);
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS(paths)],
    { stdio: 'ignore', timeout: max * 1000 }
  );
}

/**
 * Play a single audio file in the background. Returns a {cancel} handle so
 * an interactive picker can stop playback when the user moves to the next
 * item. Used by the wizard for intro + voice auditioning.
 */
export function playAsync(path) {
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', buildPlaybackPS([path])],
    { stdio: 'ignore', windowsHide: true }
  );
  return {
    cancel() { try { child.kill(); } catch {} },
  };
}
