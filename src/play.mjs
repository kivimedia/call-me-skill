// Audio playback via Windows Multimedia (winmm.dll mciSendString).
// Sync, no event handlers, native MP3/WAV support.
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
  const lines = items.map((it, i) => {
    const alias = `cms${i}`;
    const psPath = escapeForPS(it.path);
    if (it.maxMs && it.maxMs > 0) {
      // Use 'play X to N': mpegvideo device uses ms by default.
      return `
$null = [W.MCI]::mciSendString('open "${psPath}" alias ${alias}', $null, 0, [IntPtr]::Zero)
$null = [W.MCI]::mciSendString('set ${alias} time format milliseconds', $null, 0, [IntPtr]::Zero)
$null = [W.MCI]::mciSendString('play ${alias} from 0 to ${Math.floor(it.maxMs)} wait', $null, 0, [IntPtr]::Zero)
$null = [W.MCI]::mciSendString('close ${alias}', $null, 0, [IntPtr]::Zero)
`;
    }
    return `
$null = [W.MCI]::mciSendString('open "${psPath}" alias ${alias}', $null, 0, [IntPtr]::Zero)
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
