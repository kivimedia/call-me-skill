// Detect the current Windows virtual desktop index (1-based) by reading the
// HKCU registry. Works on Windows 10/11 without third-party tools.
import { execFileSync } from 'node:child_process';

const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
$base = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops'
$all = (Get-ItemProperty $base).VirtualDesktopIDs
$count = $all.Length / 16
$cur = (Get-ItemProperty $base -Name CurrentVirtualDesktop -ErrorAction SilentlyContinue).CurrentVirtualDesktop
if (-not $cur) {
  Write-Output ('{"index":1,"count":' + $count + ',"fallback":true}')
  exit 0
}
$gid = ([Guid]::new([byte[]] $cur)).Guid.ToLower()
$idx = 0
for ($i = 0; $i -lt $count; $i++) {
  $g = [Guid]::new([byte[]] $all[($i*16)..($i*16+15)])
  if ($g.Guid.ToLower() -eq $gid) { $idx = $i + 1 }
}
Write-Output ('{"index":' + $idx + ',"count":' + $count + ',"guid":"' + $gid + '"}')
`;

/**
 * Get current desktop index (1-based) and total desktop count.
 * Returns {index: number, count: number, fallback?: boolean}.
 */
export function getCurrentDesktop() {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { encoding: 'utf8', timeout: 5000 }
    );
    const trimmed = out.trim();
    return JSON.parse(trimmed);
  } catch (err) {
    // If anything goes wrong, default to "desktop 1" so the alert still works.
    return { index: 1, count: 1, fallback: true, error: err.message };
  }
}

/**
 * Get the foreground window handle (HWND as decimal int) for "the window I
 * was called from". Used by the daemon to focus the right window on
 * double-Ctrl jump. Returns 0 on failure.
 */
export function getForegroundWindowHandle() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type @' \nusing System;\nusing System.Runtime.InteropServices;\npublic class W { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }\n'@\n[W]::GetForegroundWindow().ToInt64()`,
      ],
      { encoding: 'utf8', timeout: 5000 }
    );
    const n = parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
