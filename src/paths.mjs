// Per-user config paths. NEVER inside the repo.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
export const CONFIG_DIR = join(HOME, '.config', 'call-me-skill');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const ENV_FILE = join(CONFIG_DIR, '.env');
export const VOICE_MODE_FLAG = join(CONFIG_DIR, 'voice-mode.flag');
export const LAST_CALL_FILE = join(CONFIG_DIR, 'last-call.json');
export const DAEMON_PID_FILE = join(CONFIG_DIR, 'daemon.pid');
export const DAEMON_LOG_FILE = join(CONFIG_DIR, 'daemon.log');

// Ship-with-package paths.
const __dirname = fileURLToPath(new URL('.', import.meta.url));
export const REPO_ROOT = join(__dirname, '..');
export const INTROS_DIR = join(REPO_ROOT, 'assets', 'intros');
export const TEMPLATES_DIR = join(__dirname, 'templates');

export function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}
