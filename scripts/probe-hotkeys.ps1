# Probe which hotkey combos can be registered. Run by hand to find ones
# that aren't already squatted on by Razer/Steam/Discord/etc.
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class P : Form {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing -ErrorAction Stop

$f = New-Object P
$f.CreateControl() | Out-Null

$mods = @{
  'Win+Ctrl'        = 0x0008 -bor 0x0002
  'Win+Alt'         = 0x0008 -bor 0x0001
  'Win+Shift'       = 0x0008 -bor 0x0004
  'Ctrl+Alt'        = 0x0002 -bor 0x0001
  'Ctrl+Shift'      = 0x0002 -bor 0x0004
  'Win+Ctrl+Alt'    = 0x0008 -bor 0x0002 -bor 0x0001
  'Win+Ctrl+Shift'  = 0x0008 -bor 0x0002 -bor 0x0004
  'Win+Alt+Shift'   = 0x0008 -bor 0x0001 -bor 0x0004
}

$keys = @{
  '0' = 0x30; '1' = 0x31; '2' = 0x32; '3' = 0x33; '4' = 0x34
  '5' = 0x35; '6' = 0x36; '7' = 0x37; '8' = 0x38; '9' = 0x39
  'J' = 0x4A; 'L' = 0x4C; 'K' = 0x4B
  'Pause' = 0x13; 'ScrollLock' = 0x91; 'Apps' = 0x5D
}

$id = 0
foreach ($modName in $mods.Keys) {
  foreach ($keyName in $keys.Keys) {
    $id++
    $ok = [P]::RegisterHotKey($f.Handle, $id, [uint32]($mods[$modName] -bor 0x4000), [uint32]$keys[$keyName])
    $status = if ($ok) { 'OK   ' } else { 'TAKEN' }
    Write-Output "$status $modName+$keyName"
    if ($ok) { [void][P]::UnregisterHotKey($f.Handle, $id) }
  }
}

$f.Dispose()
