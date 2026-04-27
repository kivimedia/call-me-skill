// ElevenLabs Sound Effects API client. Used by the build-time intro generator
// (scripts/generate-intros.mjs). Returns short MP3 clips - perfect for ~2-3s
// notification chimes (vs Lyria's 30s clips that we had to truncate).
//
// API reference: https://elevenlabs.io/docs/api-reference/sound-generation
import { writeFileSync } from 'node:fs';

const SFX_URL = 'https://api.elevenlabs.io/v1/sound-generation';

/**
 * Generate a sound effect MP3 from a text prompt.
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} prompt - Description of the sound (e.g. "Soft jazzy piano chord")
 * @param {object} [opts]
 * @param {number} [opts.duration=2.5] - Seconds, 0.5 to 22
 * @param {number} [opts.promptInfluence=0.3] - 0 to 1, higher = closer to prompt
 * @returns {Promise<Buffer>} MP3 bytes
 */
export async function generateSfx(apiKey, prompt, opts = {}) {
  const duration = opts.duration ?? 2.5;
  const promptInfluence = opts.promptInfluence ?? 0.3;
  const res = await fetch(SFX_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: duration,
      prompt_influence: promptInfluence,
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs SFX ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function generateSfxToFile(apiKey, prompt, outPath, opts = {}) {
  const bytes = await generateSfx(apiKey, prompt, opts);
  writeFileSync(outPath, bytes);
  return outPath;
}
