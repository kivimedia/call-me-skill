// Background hotkey daemon. Two triggers:
//   - Double-tap Ctrl (within 400ms): jump to last-call.json's desktop +
//     foreground its window.
//   - Win+Ctrl+1..9: jump to desktop N (built-in Win shortcut is broken on
//     some machines; this is a reliable fallback).
//
// Run via `call-me-skill daemon start` (spawned detached). PID + log are
// written to ~/.config/call-me-skill/.
//
// Detection is intentionally conservative: a Ctrl combo (Ctrl+C, Ctrl+V, etc.)
// resets the double-tap state machine. Holding Ctrl for >250ms also resets.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import { jumpToDesktop } from './desktop.mjs';
import { LAST_CALL_FILE, DAEMON_LOG_FILE, ensureConfigDir } from './paths.mjs';

const DOUBLE_TAP_WINDOW_MS = 400; // Time between the two CTRL DOWN events
const TAP_HOLD_MAX_MS = 250;       // Max time CTRL is held during one tap

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

export async function runDaemon() {
  ensureConfigDir();
  log('daemon starting, pid=' + process.pid);

  const listener = new GlobalKeyboardListener();

  // State for double-tap Ctrl.
  let firstDownAt = 0;     // T1: first CTRL DOWN time
  let firstUpAt = 0;       // T2: first CTRL UP time
  let armed = false;       // True after a clean tap (DOWN -> UP within hold limit)

  // State for Win+Ctrl+N.
  let winHeld = false;
  let ctrlHeld = false;

  function resetDoubleTap(reason) {
    if (firstDownAt || armed) log('double-tap reset:', reason);
    firstDownAt = 0;
    firstUpAt = 0;
    armed = false;
  }

  await listener.addListener((e) => {
    const name = e.name;
    if (!name) return;

    const isCtrl = name === 'LEFT CTRL' || name === 'RIGHT CTRL';
    const isWin = name === 'LEFT META' || name === 'RIGHT META';

    // Track modifier state for Win+Ctrl+N combo.
    if (isWin) winHeld = e.state === 'DOWN';
    if (isCtrl) ctrlHeld = e.state === 'DOWN';

    // Win+Ctrl+1..9 -> jump to desktop N. Halt propagation so Windows
    // doesn't also try to handle it (and confuse itself).
    if (e.state === 'DOWN' && winHeld && ctrlHeld && /^[1-9]$/.test(name)) {
      const target = parseInt(name, 10);
      log(`Win+Ctrl+${target} -> jumping`);
      try {
        const r = jumpToDesktop(target, 0);
        log('jump:', JSON.stringify(r));
      } catch (err) {
        log('jump failed:', err.message);
      }
      // Reset double-tap state since this was a combo.
      resetDoubleTap('win+ctrl+N consumed');
      return true; // halt
    }

    // Double-Ctrl detection.
    // Any non-Ctrl, non-Win key event resets the state machine - this
    // prevents Ctrl+C, Ctrl+V, Ctrl+arrow from arming a double-tap.
    if (!isCtrl && !isWin) {
      if (e.state === 'DOWN') resetDoubleTap('non-modifier key down');
      return false;
    }

    if (!isCtrl) return false; // pure Win key events: ignore

    const now = Date.now();

    if (e.state === 'DOWN') {
      if (armed && now - firstDownAt <= DOUBLE_TAP_WINDOW_MS && now - firstUpAt > 0) {
        // Second DOWN within the window -> trigger.
        log('double-Ctrl detected, dt=' + (now - firstDownAt) + 'ms');
        resetDoubleTap('triggered');
        const last = readLastCall();
        if (!last) {
          log('no last-call.json - skipping jump');
          return false;
        }
        log('jumping to desktop', last.desktop_index, 'hwnd', last.window_handle);
        try {
          const r = jumpToDesktop(last.desktop_index, last.window_handle || 0);
          log('jump:', JSON.stringify(r));
        } catch (err) {
          log('jump failed:', err.message);
        }
        return false;
      }
      // First DOWN of a new (potential) double-tap.
      firstDownAt = now;
      firstUpAt = 0;
      armed = false;
    } else if (e.state === 'UP') {
      if (firstDownAt && !armed) {
        const heldFor = now - firstDownAt;
        if (heldFor <= TAP_HOLD_MAX_MS) {
          firstUpAt = now;
          armed = true;
        } else {
          resetDoubleTap('held too long: ' + heldFor + 'ms');
        }
      }
    }

    return false;
  });

  log('daemon ready - listening for double-Ctrl and Win+Ctrl+1..9');

  // Keep alive.
  process.on('SIGTERM', () => { log('SIGTERM, exiting'); process.exit(0); });
  process.on('SIGINT', () => { log('SIGINT, exiting'); process.exit(0); });
  setInterval(() => {}, 1 << 30); // hold the event loop open
}
