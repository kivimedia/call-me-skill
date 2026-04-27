// CLI helpers for `call-me-skill daemon start|stop|status`.
// Spawns native\CallMeSkillDaemon.exe (a tiny C# console app, ~10KB binary,
// ~15MB resident). PID written to ~/.config/call-me-skill/daemon.pid for
// stop/status. Falls back to hotkeys.ps1 if the .exe is missing.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { DAEMON_PID_FILE, DAEMON_LOG_FILE, ensureConfigDir } from './paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NATIVE_EXE = join(__dirname, '..', 'native', 'CallMeSkillDaemon.exe');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(DAEMON_PID_FILE)) return 0;
  const n = parseInt(readFileSync(DAEMON_PID_FILE, 'utf8').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

export function daemonStatus() {
  const pid = readPid();
  if (!pid) return { running: false };
  if (!isAlive(pid)) return { running: false, stalePid: pid };
  return { running: true, pid };
}

export function daemonStart() {
  ensureConfigDir();
  const cur = daemonStatus();
  if (cur.running) {
    console.log(`daemon already running (pid ${cur.pid})`);
    return;
  }
  if (cur.stalePid) {
    try { unlinkSync(DAEMON_PID_FILE); } catch {}
  }

  const out = openSync(DAEMON_LOG_FILE, 'a');
  let child;
  if (existsSync(NATIVE_EXE)) {
    child = spawn(NATIVE_EXE, [], {
      detached: true,
      stdio: ['ignore', out, out],
      windowsHide: true,
    });
  } else {
    console.error('No daemon executable found. Reinstall the package.');
    return;
  }
  child.unref();
  writeFileSync(DAEMON_PID_FILE, String(child.pid));
  console.log(`daemon started (pid ${child.pid})`);
  console.log(`log: ${DAEMON_LOG_FILE}`);
}

export function daemonStop() {
  const pid = readPid();
  if (!pid) {
    console.log('daemon not running (no pid file)');
    return;
  }
  if (!isAlive(pid)) {
    console.log(`daemon not running (stale pid ${pid})`);
    try { unlinkSync(DAEMON_PID_FILE); } catch {}
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`daemon stopped (pid ${pid})`);
  } catch (e) {
    console.log(`failed to stop pid ${pid}: ${e.message}`);
    return;
  }
  try { unlinkSync(DAEMON_PID_FILE); } catch {}
}

export function daemonStatusCmd() {
  const s = daemonStatus();
  if (s.running) console.log(`running (pid ${s.pid})`);
  else if (s.stalePid) console.log(`not running (stale pid ${s.stalePid})`);
  else console.log('not running');
}
