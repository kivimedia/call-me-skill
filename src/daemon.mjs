// Background hotkey daemon. Spawns hotkeys.ps1 (PowerShell using
// RegisterHotKey via P/Invoke) and reacts to TRIGGER:<name> lines.
//
// Hotkeys (registered by hotkeys.ps1):
//   Win+Ctrl+0     -> jump to last call's desktop + window
//   Win+Ctrl+1..9  -> jump to desktop N
//
// Why PowerShell + RegisterHotKey instead of low-level keyboard hooks:
// Windows Defender flags low-level hooks (e.g. node-global-key-listener's
// WinKeyServer.exe) as keylogger malware and quarantines them. RegisterHotKey
// is the official Windows API for this and never trips antivirus.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { jumpToDesktop } from './desktop.mjs';
import { LAST_CALL_FILE, DAEMON_LOG_FILE, ensureConfigDir } from './paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PS_SCRIPT = join(__dirname, 'hotkeys.ps1');

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}\n`;
  try { appendFileSync(DAEMON_LOG_FILE, line); } catch {}
  if (process.stdout.isTTY) process.stdout.write(line);
}

function readLastCall() {
  if (!existsSync(LAST_CALL_FILE)) return null;
  try {
    return JSON.parse(readFileSync(LAST_CALL_FILE, 'utf8'));
  } catch (e) {
    log('last-call.json parse failed:', e.message);
    return null;
  }
}

function handleTrigger(name) {
  if (name === 'last') {
    const last = readLastCall();
    if (!last) {
      log('Win+Ctrl+0 pressed but no last-call.json - run `call-me-skill speak ...` first');
      return;
    }
    log('Win+Ctrl+0 -> last call: desktop', last.desktop_index, 'hwnd', last.window_handle);
    try {
      const r = jumpToDesktop(last.desktop_index, last.window_handle || 0);
      log('jump:', JSON.stringify(r));
    } catch (e) {
      log('jump failed:', e.message);
    }
    return;
  }
  const m = name.match(/^jump-(\d)$/);
  if (m) {
    const target = parseInt(m[1], 10);
    log(`Win+Ctrl+${target} -> jumping`);
    try {
      const r = jumpToDesktop(target, 0);
      log('jump:', JSON.stringify(r));
    } catch (e) {
      log('jump failed:', e.message);
    }
    return;
  }
  log('unknown trigger:', name);
}

export async function runDaemon() {
  ensureConfigDir();
  log('daemon starting, pid=' + process.pid);

  const ps = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
  );

  let stdoutBuf = '';
  ps.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString();
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line.startsWith('TRIGGER:')) handleTrigger(line.slice(8));
      else if (line.startsWith('HOTKEY:')) {
        log(`hotkey registered: ${line.slice(7)} = jump to last call`);
      }
      else if (line) log('ps stdout:', line);
    }
  });
  ps.stderr.on('data', (chunk) => {
    const s = chunk.toString().trim();
    if (s) log('ps stderr:', s);
  });
  ps.on('exit', (code) => {
    log('hotkeys.ps1 exited with code', code, '- daemon shutting down');
    process.exit(code === 0 ? 0 : 1);
  });

  log('daemon ready - waiting for hotkeys.ps1 to register');

  process.on('SIGTERM', () => {
    log('SIGTERM, killing PowerShell child');
    try { ps.stdin.end(); } catch {}
    try { ps.kill(); } catch {}
    process.exit(0);
  });
  process.on('SIGINT', () => {
    log('SIGINT, killing PowerShell child');
    try { ps.stdin.end(); } catch {}
    try { ps.kill(); } catch {}
    process.exit(0);
  });
}
