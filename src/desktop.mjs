// Detect the current Windows virtual desktop index (1-based) by reading the
// HKCU registry. Works on Windows 10/11 without third-party tools.
//
// Also: jump to a desktop by sending Win+Ctrl+Right/Left N times (no native
// COM helper needed - works on every Windows version) and foreground a saved
// window handle.
import { execFileSync } from 'node:child_process';

const PS_CURRENT = `
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

export function getCurrentDesktop() {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_CURRENT],
      { encoding: 'utf8', timeout: 5000 }
    );
    return JSON.parse(out.trim());
  } catch (err) {
    return { index: 1, count: 1, fallback: true, error: err.message };
  }
}

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

// PowerShell helper that sends N synthetic Win+Ctrl+{Right|Left} keypresses
// via SendInput (the SendKeys class can't reliably emit Win-key combos).
// Then SetForegroundWindow on $Hwnd if non-zero, after a small delay so the
// desktop transition animation completes first.
// Values are templated in from JS (no -args binding to -Command scripts in PS).
function buildJumpScript(steps, direction, hwnd) {
  return `
$Steps = ${steps}
$Direction = '${direction}'
$Hwnd = ${hwnd}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SI {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public KEYBDINPUT ki; public uint pad1; public uint pad2; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
function Down([uint16]$vk) {
  $i = New-Object SI+INPUT
  $i.type = 1
  $i.ki.wVk = $vk
  $i.ki.dwFlags = 0
  return $i
}
function Up([uint16]$vk) {
  $i = New-Object SI+INPUT
  $i.type = 1
  $i.ki.wVk = $vk
  $i.ki.dwFlags = 2
  return $i
}
$VK_LWIN = 0x5B
$VK_CONTROL = 0x11
$VK_RIGHT = 0x27
$VK_LEFT = 0x25
$arrow = if ($Direction -eq 'Right') { $VK_RIGHT } else { $VK_LEFT }
if ($Steps -gt 0) {
  $seq = @()
  $seq += Down $VK_LWIN
  $seq += Down $VK_CONTROL
  for ($i = 0; $i -lt $Steps; $i++) {
    $seq += Down $arrow
    $seq += Up $arrow
  }
  $seq += Up $VK_CONTROL
  $seq += Up $VK_LWIN
  [void][SI]::SendInput([uint32]$seq.Count, $seq, [System.Runtime.InteropServices.Marshal]::SizeOf((New-Object SI+INPUT)))
  Start-Sleep -Milliseconds (200 + $Steps * 60)
}
if ($Hwnd -ne 0) {
  $h = [IntPtr]$Hwnd
  if ([SI]::IsIconic($h)) { [void][SI]::ShowWindow($h, 9) } # SW_RESTORE
  [void][SI]::SetForegroundWindow($h)
}
`;
}

/**
 * Jump to a 1-based desktop index. Optionally foreground hwnd after the jump.
 * Returns {fromIndex, toIndex, steps, direction}.
 */
export function jumpToDesktop(targetIdx, hwnd = 0) {
  const { index: cur, count } = getCurrentDesktop();
  const target = Math.max(1, Math.min(count, parseInt(targetIdx, 10) || 1));
  const delta = target - cur;
  const steps = Math.abs(delta);
  const direction = delta >= 0 ? 'Right' : 'Left';
  if (steps === 0 && (!hwnd || hwnd === 0)) {
    return { fromIndex: cur, toIndex: target, steps: 0, direction, noop: true };
  }
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      buildJumpScript(steps, direction, hwnd || 0),
    ],
    { timeout: 10000, stdio: ['ignore', 'ignore', 'pipe'] }
  );
  return { fromIndex: cur, toIndex: target, steps, direction };
}
