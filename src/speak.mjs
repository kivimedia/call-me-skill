// Top-level orchestrator: compose sentence + TTS + play intro + speak.
import { writeFileSync, existsSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig, loadEnv } from './config.mjs';
import { compose } from './compose.mjs';
import { tts } from './voice.mjs';
import { getCallerDesktop, getForegroundWindowHandle, findWindowHandle } from './desktop.mjs';
import { playSequence } from './play.mjs';
import { INTROS_DIR, LAST_CALL_FILE, CONFIG_DIR, ensureConfigDir } from './paths.mjs';

/**
 * Speak a message through the speakers.
 *
 * @param {string} message
 * @param {object} [opts]
 * @param {string} [opts.length] - short|medium|long override
 * @param {boolean} [opts.noIntro=false]
 * @param {boolean} [opts.stable=false] - same message = same wording, so the TTS cache answers repeats
 * @param {string} [opts.focus] - window title pattern OR alias (vscode|cursor|chrome|edge|firefox|terminal|foreground).
 *   Default: foreground window at speak() time. The daemon's hotkey
 *   (Win+Ctrl+J) foregrounds whichever HWND is saved here.
 */
export async function speak(message, opts = {}) {
  const cfg = loadConfig();
  if (!cfg) {
    throw new Error('No config found. Run: call-me-skill setup');
  }
  const env = loadEnv();
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY missing in ~/.config/call-me-skill/.env. Run: call-me-skill setup');
  }
  if (!cfg.voice_id) {
    throw new Error('No voice_id in config. Run: call-me-skill setup');
  }

  // Use the CALLER's desktop (where the process invoking speak actually lives),
  // not the foreground desktop. Critical for automated callers like Claude Code
  // that run on a different virtual desktop from whatever the human is looking at.
  // Falls back to getCurrentDesktop() if no PID env var is set (interactive CLI use).
  const desktop = getCallerDesktop();
  const sentence = compose(cfg, message, desktop.index, { lengthOverride: opts.length, stable: !!opts.stable, noDesktop: !!opts.noDesktop });

  // Save last-call state for the daemon hotkey.
  // window_handle: target for SetForegroundWindow when user hits the hotkey.
  //   If --focus is provided, resolve to that window (e.g. VS Code, Chrome).
  //   Falls back to current foreground if the focus pattern matches nothing.
  let hwnd = 0;
  let focusUsed = 'foreground';
  if (opts.focus) {
    hwnd = findWindowHandle(opts.focus);
    focusUsed = hwnd ? `match for "${opts.focus}"` : `"${opts.focus}" not found, using foreground`;
  }
  const forcedHwnd = parseInt(process.env.CALL_ME_HWND || '', 10);
  if (!hwnd && Number.isFinite(forcedHwnd) && forcedHwnd > 0) {
    hwnd = forcedHwnd;
    focusUsed = 'CALL_ME_HWND';
  }
  if (!hwnd) hwnd = getForegroundWindowHandle();

  ensureConfigDir();
  writeFileSync(
    LAST_CALL_FILE,
    JSON.stringify(
      {
        desktop_index: desktop.index,
        desktop_source: desktop.source,
        window_handle: hwnd,
        focus_used: focusUsed,
        sentence,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // TTS MP3, cached by voice + sentence: a sentence already spoken costs no ElevenLabs credits.
  const cacheDir = join(CONFIG_DIR, 'tts-cache');
  const key = createHash('sha1').update(`${cfg.voice_id}|eleven_multilingual_v2|${sentence}`).digest('hex').slice(0, 20);
  const ttsPath = join(cacheDir, `${key}.mp3`);
  let cached = false;
  if (existsSync(ttsPath) && statSync(ttsPath).size > 1000) {
    cached = true;
  } else {
    const ttsBytes = await tts(apiKey, cfg.voice_id, sentence);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(ttsPath, ttsBytes);
    pruneCache(cacheDir, 400);
  }

  // Build playback queue. Cap the intro at 1200ms - ElevenLabs SFX often
  // pads the clip with silence after the actual chime, which mci's
  // `play wait` would otherwise sit through before starting TTS.
  const queue = [];
  if (!opts.noIntro && cfg.intro_index && cfg.intro_index !== 'none') {
    const introNum = String(cfg.intro_index).padStart(2, '0');
    queue.push({ path: join(INTROS_DIR, `intro-${introNum}.mp3`), maxMs: 700 });
  }
  queue.push({ path: ttsPath });

  playSequence(queue);

  return { sentence, desktopIndex: desktop.index, cached };
}

// Keep the newest `keep` cached clips.
function pruneCache(dir, keep) {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }));
    if (files.length <= keep) return;
    files.sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(keep)) { try { unlinkSync(join(dir, f)); } catch {} }
  } catch {}
}
