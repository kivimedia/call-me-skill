// Top-level orchestrator: compose sentence + TTS + play intro + speak.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadEnv } from './config.mjs';
import { compose } from './compose.mjs';
import { tts } from './voice.mjs';
import { getCurrentDesktop, getForegroundWindowHandle } from './desktop.mjs';
import { playSequence } from './play.mjs';
import { INTROS_DIR, LAST_CALL_FILE, ensureConfigDir } from './paths.mjs';

/**
 * Speak a message through the speakers.
 *
 * @param {string} message
 * @param {object} [opts]
 * @param {string} [opts.length] - short|medium|long override
 * @param {boolean} [opts.noIntro=false]
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

  // Save last-call state for the daemon's double-Ctrl jump.
  ensureConfigDir();
  writeFileSync(
    LAST_CALL_FILE,
    JSON.stringify(
      {
        desktop_index: desktop.index,
        window_handle: getForegroundWindowHandle(),
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

  // Build playback queue.
  const queue = [];
  if (!opts.noIntro && cfg.intro_index && cfg.intro_index !== 'none') {
    const introNum = String(cfg.intro_index).padStart(2, '0');
    queue.push(join(INTROS_DIR, `intro-${introNum}.mp3`));
  }
  queue.push(ttsPath);

  playSequence(queue);

  return { sentence, desktopIndex: desktop.index };
}
