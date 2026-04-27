// Config + .env IO for ~/.config/call-me-skill/.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIG_FILE, ENV_FILE, ensureConfigDir } from './paths.mjs';

export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

export function saveConfig(cfg) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function loadEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function saveEnv(env) {
  ensureConfigDir();
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
}
