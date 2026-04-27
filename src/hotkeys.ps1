# PowerShell hotkey daemon for call-me-skill.
# Uses Win32 RegisterHotKey via P/Invoke (the OFFICIAL Windows API for
# global hotkeys). No low-level keyboard hook = no antivirus false positive.
#
# Registers ONE hotkey: jump to the last call's desktop + window.
# Tries a list of candidate combos so we don't fight Razer/Steam/etc. for
# popular shortcuts like Win+Ctrl+0. The first combo that works wins, and
# we report it via stdout so the daemon (and user) knows what to press.
#
# Numeric jumps (jump to desktop N) stay on the CLI: `call-me-skill jump N`.

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class HK : Form {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  public const int WM_HOTKEY = 0x0312;
  public const uint MOD_ALT = 0x0001;
  public const uint MOD_CONTROL = 0x0002;
  public const uint MOD_SHIFT = 0x0004;
  public const uint MOD_WIN = 0x0008;
  public const uint MOD_NOREPEAT = 0x4000;
  public Action<int> OnHotkey;
  public HK() {
    this.ShowInTaskbar = false;
    this.WindowState = FormWindowState.Minimized;
    this.FormBorderStyle = FormBorderStyle.FixedToolWindow;
    this.Opacity = 0;
    this.Load += (s,e) => { this.Hide(); };
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_HOTKEY && OnHotkey != null) {
      OnHotkey((int)m.WParam);
    }
    base.WndProc(ref m);
  }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing -ErrorAction Stop

$form = New-Object HK
$form.CreateControl() | Out-Null

# Candidate hotkeys for "jump to last call". Tried in order. First win.
# Each: name (for display), modifier bitmask, virtual key code.
$CANDIDATES = @(
  @{ name = 'Win+Ctrl+J';     mods = [HK]::MOD_WIN -bor [HK]::MOD_CONTROL;                  vk = 0x4A },  # J
  @{ name = 'Win+Ctrl+L';     mods = [HK]::MOD_WIN -bor [HK]::MOD_CONTROL;                  vk = 0x4C },  # L
  @{ name = 'Win+Ctrl+K';     mods = [HK]::MOD_WIN -bor [HK]::MOD_CONTROL;                  vk = 0x4B },  # K
  @{ name = 'Win+Alt+J';      mods = [HK]::MOD_WIN -bor [HK]::MOD_ALT;                      vk = 0x4A },
  @{ name = 'Win+Shift+J';    mods = [HK]::MOD_WIN -bor [HK]::MOD_SHIFT;                    vk = 0x4A },
  @{ name = 'Win+Ctrl+Pause'; mods = [HK]::MOD_WIN -bor [HK]::MOD_CONTROL;                  vk = 0x13 },
  @{ name = 'Ctrl+Alt+J';     mods = [HK]::MOD_CONTROL -bor [HK]::MOD_ALT;                  vk = 0x4A }
)

$winning = $null
foreach ($c in $CANDIDATES) {
  $mods = [uint32]($c.mods -bor [HK]::MOD_NOREPEAT)
  $ok = [HK]::RegisterHotKey($form.Handle, 1, $mods, [uint32]$c.vk)
  if ($ok) {
    $winning = $c.name
    [Console]::Error.WriteLine("INFO: registered $winning")
    [Console]::Out.WriteLine("HOTKEY:$winning")
    [Console]::Out.Flush()
    break
  } else {
    [Console]::Error.WriteLine("INFO: $($c.name) taken - falling back")
  }
}
if (-not $winning) {
  [Console]::Error.WriteLine("ERROR: every candidate hotkey is in use - try closing Razer Synapse / Discord / Steam and retry")
  exit 1
}

$form.OnHotkey = {
  param($id)
  [Console]::Out.WriteLine("TRIGGER:last")
  [Console]::Out.Flush()
}

# Watch stdin in background; exit when parent closes pipe.
$stdinWatcher = [PowerShell]::Create().AddScript({
  try { [Console]::In.ReadToEnd() | Out-Null } catch {}
})
$stdinHandle = $stdinWatcher.BeginInvoke()

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
  if ($stdinHandle.IsCompleted) {
    [Console]::Error.WriteLine("stdin closed - exiting")
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run($form)

[void][HK]::UnregisterHotKey($form.Handle, 1)
$timer.Stop()
$form.Dispose()
