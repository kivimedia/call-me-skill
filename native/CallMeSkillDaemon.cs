// call-me-skill native hotkey daemon.
//
// Pure Win32 console app: registers ONE global hotkey, runs a message
// loop, and on trigger reads ~/.config/call-me-skill/last-call.json,
// sends Win+Ctrl+Arrow keypresses to switch desktop, then SetForegroundWindow.
//
// Resident memory: ~10-15MB (vs ~87MB for the PowerShell+WinForms version).
//
// Build (no MSBuild needed - csc.exe ships with .NET Framework 4):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe ^
//     /target:exe /out:CallMeSkillDaemon.exe CallMeSkillDaemon.cs
//
// Or run scripts\build-helper.ps1 from the repo root.

using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace CallMeSkill {
class Daemon {

  // ---- Win32 ----
  [DllImport("user32.dll", SetLastError = true)]
  static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")]
  static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")]
  static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
  [DllImport("user32.dll")]
  static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")]
  static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  static extern bool IsIconic(IntPtr hWnd);

  [StructLayout(LayoutKind.Sequential)]
  struct MSG {
    public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam;
    public uint time; public int x; public int y;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct INPUT { public uint type; public KEYBDINPUT ki; public uint pad1; public uint pad2; }
  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }

  const int WM_HOTKEY = 0x0312;
  const uint MOD_ALT = 0x0001, MOD_CTRL = 0x0002, MOD_SHIFT = 0x0004, MOD_WIN = 0x0008, MOD_NOREPEAT = 0x4000;
  const ushort VK_LWIN = 0x5B, VK_CTRL = 0x11, VK_LEFT = 0x25, VK_RIGHT = 0x27, VK_PAUSE = 0x13;
  const ushort VK_J = 0x4A, VK_K = 0x4B, VK_L = 0x4C;

  // ---- Logging ----
  // Always writes to Console.Out. When started via daemon-cli.mjs, Node
  // redirects stdout to daemon.log. When run directly for debugging, you
  // see it in the console.
  static void Log(string msg) {
    try {
      Console.Out.WriteLine("[" + DateTime.UtcNow.ToString("o") + "] " + msg);
      Console.Out.Flush();
    } catch { }
  }

  // ---- Config / paths ----
  static string LastCallFile;

  // ---- Hotkey candidates: first that registers wins ----
  struct Candidate { public string name; public uint mods; public ushort vk; }
  static Candidate[] Candidates = new[] {
    new Candidate { name = "Win+Ctrl+J",     mods = MOD_WIN | MOD_CTRL,  vk = VK_J },
    new Candidate { name = "Win+Ctrl+L",     mods = MOD_WIN | MOD_CTRL,  vk = VK_L },
    new Candidate { name = "Win+Ctrl+K",     mods = MOD_WIN | MOD_CTRL,  vk = VK_K },
    new Candidate { name = "Win+Alt+J",      mods = MOD_WIN | MOD_ALT,   vk = VK_J },
    new Candidate { name = "Win+Shift+J",    mods = MOD_WIN | MOD_SHIFT, vk = VK_J },
    new Candidate { name = "Win+Ctrl+Pause", mods = MOD_WIN | MOD_CTRL,  vk = VK_PAUSE },
    new Candidate { name = "Ctrl+Alt+J",    mods = MOD_CTRL | MOD_ALT,  vk = VK_J }
  };

  // ---- Desktop detection (HKCU registry) ----
  static int GetCurrentDesktop(out int count) {
    count = 1;
    try {
      using (var k = Registry.CurrentUser.OpenSubKey(
          @"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops")) {
        if (k == null) return 1;
        var allObj = k.GetValue("VirtualDesktopIDs") as byte[];
        var curObj = k.GetValue("CurrentVirtualDesktop") as byte[];
        if (allObj == null) return 1;
        count = allObj.Length / 16;
        if (curObj == null) return 1;
        var curGuid = new Guid(curObj);
        for (int i = 0; i < count; i++) {
          var slice = new byte[16];
          Array.Copy(allObj, i * 16, slice, 0, 16);
          if (new Guid(slice) == curGuid) return i + 1;
        }
      }
    } catch (Exception e) { Log("desktop read failed: " + e.Message); }
    return 1;
  }

  // ---- Send a single key down/up ----
  static INPUT KeyDown(ushort vk) {
    var i = new INPUT(); i.type = 1; i.ki = new KEYBDINPUT(); i.ki.wVk = vk; i.ki.dwFlags = 0; return i;
  }
  static INPUT KeyUp(ushort vk) {
    var i = new INPUT(); i.type = 1; i.ki = new KEYBDINPUT(); i.ki.wVk = vk; i.ki.dwFlags = 2; return i;
  }

  static void JumpToDesktop(int targetIdx, long hwnd) {
    int count;
    int cur = GetCurrentDesktop(out count);
    int target = Math.Max(1, Math.Min(count, targetIdx));
    int delta = target - cur;
    int steps = Math.Abs(delta);
    ushort arrow = delta >= 0 ? VK_RIGHT : VK_LEFT;
    if (steps > 0) {
      var seq = new INPUT[steps * 2 + 4];
      int idx = 0;
      seq[idx++] = KeyDown(VK_LWIN);
      seq[idx++] = KeyDown(VK_CTRL);
      for (int s = 0; s < steps; s++) {
        seq[idx++] = KeyDown(arrow);
        seq[idx++] = KeyUp(arrow);
      }
      seq[idx++] = KeyUp(VK_CTRL);
      seq[idx++] = KeyUp(VK_LWIN);
      SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT)));
      System.Threading.Thread.Sleep(200 + steps * 60);
    }
    if (hwnd != 0) {
      var h = new IntPtr(hwnd);
      if (IsIconic(h)) ShowWindow(h, 9);
      SetForegroundWindow(h);
    }
    Log("jumped: desktop " + cur + " -> " + target + " (steps=" + steps + "), hwnd=" + hwnd);
  }

  // ---- Last-call.json minimal parser (avoids JSON.NET dependency) ----
  static void HandleHotkey() {
    if (!File.Exists(LastCallFile)) {
      Log("hotkey pressed but no last-call.json - run 'call-me-skill speak ...' first");
      return;
    }
    try {
      string text = File.ReadAllText(LastCallFile);
      int desktopIdx = ParseInt(text, "desktop_index");
      long hwnd = ParseLong(text, "window_handle");
      JumpToDesktop(desktopIdx, hwnd);
    } catch (Exception e) {
      Log("jump failed: " + e.Message);
    }
  }
  static int ParseInt(string text, string key) { return (int)ParseLong(text, key); }
  static long ParseLong(string text, string key) {
    int i = text.IndexOf("\"" + key + "\"");
    if (i < 0) return 0;
    int colon = text.IndexOf(':', i); if (colon < 0) return 0;
    int j = colon + 1;
    while (j < text.Length && (text[j] == ' ' || text[j] == '\t')) j++;
    int start = j;
    while (j < text.Length && (char.IsDigit(text[j]) || text[j] == '-')) j++;
    long n;
    return long.TryParse(text.Substring(start, j - start), out n) ? n : 0;
  }

  static int Main(string[] args) {
    string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    string configDir = Path.Combine(home, ".config", "call-me-skill");
    LastCallFile = Path.Combine(configDir, "last-call.json");
    try { Directory.CreateDirectory(configDir); } catch { }

    // Register hotkey (try fallbacks).
    string winning = null;
    foreach (var c in Candidates) {
      if (RegisterHotKey(IntPtr.Zero, 1, c.mods | MOD_NOREPEAT, c.vk)) {
        winning = c.name;
        Log("native daemon ready, pid=" + System.Diagnostics.Process.GetCurrentProcess().Id +
            " - hotkey registered: " + winning);
        break;
      } else {
        Log("candidate " + c.name + " taken, falling back");
      }
    }
    if (winning == null) {
      Log("ERROR: every candidate hotkey is in use. Close Razer/Steam/Discord and retry.");
      return 1;
    }

    // Message pump - blocks waiting for WM_HOTKEY. Threadless hotkey reg
    // (hWnd=null) means messages arrive on this thread's queue.
    MSG msg;
    while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
      if (msg.message == WM_HOTKEY) HandleHotkey();
    }
    UnregisterHotKey(IntPtr.Zero, 1);
    return 0;
  }
}
}
