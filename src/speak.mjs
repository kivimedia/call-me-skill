// Top-level orchestrator: compose sentence + TTS + play intro + speak.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadEnv } from './config.mjs';
import { compose } from './compose.mjs';
import { tts } from './voice.mjs';
import { getCurrentDesktop, getForegroundWindowHandle, findWindowHandle } from './desktop.mjs';
import { playSequence } from './play.mjs';
import { INTROS_DIR, LAST_CALL_FILE, ensureConfigDir } from './paths.mjs';

/**
 * Speak a message through the speakers.
 *
 * @param {string} message
 * @param {object} [opts]
 * @param {string} [opts.length] - short|medium|long override
 * @param {boolean} [opts.noIntro=false]
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

  const desktop = getCurrentDesktop();
  const sentence = compose(cfg, message, desktop.index, { lengthOverride: opts.length });

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
  if (!hwnd) hwnd = getForegroundWindowHandle();

  ensureConfigDir();
  writeFileSync(
    LAST_CALL_FILE,
    JSON.stringify(
      {
        desktop_index: desktop.index,
        window_handle: hwnd,
        focus_used: focusUsed,
        sentence,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // Generate the TTS MP3.
  const ttsBytes = await tts(apiKey, cfg.voice_id, sentence);
  const ttsPath = join(tmpdir(), `call-me-skill-${Date.now()}.mp3`);
  writeFileSync(ttsPath, ttsBytes);

  // Build playback queue. Cap the intro at 1200ms - ElevenLabs SFX often
  // pads the clip with silence after the actual chime, which mci's
  // `play wait` would otherwise sit through before starting TTS.
  const queue = [];
  if (!opts.noIntro && cfg.intro_index && cfg.intro_index !== 'none') {
    const introNum = String(cfg.intro_index).padStart(2, '0');
    queue.push({ path: join(INTROS_DIR, `intro-${introNum}.mp3`), maxMs: 1200 });
  }
  queue.push({ path: ttsPath });

  playSequence(queue);

  return { sentence, desktopIndex: desktop.index };
}
