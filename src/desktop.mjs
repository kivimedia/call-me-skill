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

// Detect the desktop where the CALLING process actually lives. Uses
// IVirtualDesktopManager::GetWindowDesktopId on the caller's main window,
// not the foreground-desktop registry value (which tracks whichever desktop
// the human is currently looking at - wrong answer when an automated agent
// like Claude Code calls speak() from a window on a DIFFERENT desktop).
//
// Resolution order:
//   1. CALL_ME_PID env var (explicit override, any callable process)
//   2. VSCODE_PID    (set in every VS Code integrated terminal)
//   3. CURSOR_PID    (Cursor's equivalent)
//   4. ANTIGRAVITY_PID  (Antigravity's equivalent, if set)
//   5. fallback to getCurrentDesktop() (foreground = old behavior)
//
// On any failure (PID has no MainWindowHandle, COM call throws, etc.) we
// transparently fall back to getCurrentDesktop() so callers never break.
const PS_CALLER = (pid) => `
$ErrorActionPreference = 'Stop'
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if (-not $proc -or $proc.MainWindowHandle -eq 0) {
  Write-Output '{"ok":false,"reason":"no-mainwindow"}'
  exit 0
}
$hwnd = $proc.MainWindowHandle
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("a5cd92ff-29be-454c-8d04-d82879fb3f1b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IVDM {
  [PreserveSig] int IsWindowOnCurrentVirtualDesktop(IntPtr h, out bool b);
  [PreserveSig] int GetWindowDesktopId(IntPtr h, out Guid g);
}
public static class VDM {
  static readonly Guid CLSID = new Guid("aa509086-5ca9-4c25-8f95-589d3c07b48a");
  public static Guid GetDesktop(IntPtr h) {
    var t = Type.GetTypeFromCLSID(CLSID);
    var o = (IVDM)Activator.CreateInstance(t);
    Guid g;
    int hr = o.GetWindowDesktopId(h, out g);
    if (hr != 0) throw new System.ComponentModel.Win32Exception(hr);
    return g;
  }
}
"@
$g = ([VDM]::GetDesktop([IntPtr]$hwnd)).Guid.ToLower()
$base = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VirtualDesktops'
$all = (Get-ItemProperty $base).VirtualDesktopIDs
$count = $all.Length / 16
$idx = 0
for ($i = 0; $i -lt $count; $i++) {
  $guid = [Guid]::new([byte[]] $all[($i*16)..($i*16+15)]).Guid.ToLower()
  if ($guid -eq $g) { $idx = $i + 1; break }
}
Write-Output ('{"ok":true,"index":' + $idx + ',"count":' + $count + ',"hwnd":' + $hwnd + ',"guid":"' + $g + '"}')
`;

const CALLER_PID_VARS = ['CALL_ME_PID', 'VSCODE_PID', 'CURSOR_PID', 'ANTIGRAVITY_PID'];

export function getCallerDesktop() {
  let pid = null;
  let envSource = null;
  for (const k of CALLER_PID_VARS) {
    const v = process.env[k];
    if (!v) continue;
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) {
      pid = n;
      envSource = k;
      break;
    }
  }
  if (!pid) {
    return { ...getCurrentDesktop(), source: 'foreground-no-pid' };
  }
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_CALLER(pid)],
      { encoding: 'utf8', timeout: 10000 }
    );
    const result = JSON.parse(out.trim());
    if (result.ok && result.index > 0) {
      return {
        index: result.index,
        count: result.count,
        guid: result.guid,
        source: `caller-pid:${envSource}`,
        pid,
        hwnd: result.hwnd,
      };
    }
    return { ...getCurrentDesktop(), source: `foreground-fallback:${envSource}:${result.reason || 'unknown'}` };
  } catch (err) {
    return { ...getCurrentDesktop(), source: `foreground-fallback:${envSource}:exception`, error: err.message };
  }
}

/**
 * Find the HWND of a window whose title contains `pattern` (case-insensitive
 * substring match). Returns the most-recently-active match, or 0 if none.
 *
 * Built-in aliases for common targets:
 *   'vscode' | 'code'  -> 'Visual Studio Code'
 *   'cursor'           -> 'Cursor'
 *   'chrome'           -> 'Google Chrome'
 *   'edge'             -> 'Microsoft‐ Edge'
 *   'firefox'          -> 'Firefox'
 *   'terminal'         -> 'Terminal'
 *   'foreground'       -> current foreground window (returns getForegroundWindowHandle())
 */
const FOCUS_ALIASES = {
  vscode: 'Visual Studio Code',
  code: 'Visual Studio Code',
  cursor: 'Cursor',
  antigravity: 'PR team',
  claude: 'PR team',
  chrome: 'Google Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  terminal: 'Terminal',
};

export function findWindowHandle(pattern) {
  if (!pattern) return 0;
  if (pattern.toLowerCase() === 'foreground') return getForegroundWindowHandle();
  const target = (FOCUS_ALIASES[pattern.toLowerCase()] || pattern).toLowerCase();
  const ps = `
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WF {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static List<IntPtr> Find(string needle) {
    var hits = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      int len = GetWindowTextLength(h);
      if (len <= 0) return true;
      var sb = new StringBuilder(len + 1);
      GetWindowText(h, sb, sb.Capacity);
      if (sb.ToString().ToLower().Contains(needle)) hits.Add(h);
      return true;
    }, IntPtr.Zero);
    return hits;
  }
}
"@
$hits = [WF]::Find('${target.replace(/'/g, "''")}')
if ($hits.Count -gt 0) { $hits[0].ToInt64() } else { 0 }
`;
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 5000 }
    );
    const n = parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
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
