// ElevenLabs TTS + voice listing.
import { writeFileSync } from 'node:fs';

const ADAM_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Excluded from voice picker (default).
const DEFAULT_MODEL = 'eleven_multilingual_v2';

export async function listVoices(apiKey, { excludeDefault = true } = {}) {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (r.status !== 200) {
    throw new Error(`ElevenLabs /v1/voices failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const json = await r.json();
  let voices = json.voices || [];
  if (excludeDefault) voices = voices.filter((v) => v.voice_id !== ADAM_VOICE_ID);
  return voices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    labels: v.labels || {},
    category: v.category,
    description: v.description,
    preview_url: v.preview_url,
  }));
}

export async function tts(apiKey, voiceId, text, { model = DEFAULT_MODEL } = {}) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (r.status !== 200) {
    throw new Error(`ElevenLabs TTS failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

export async function ttsToFile(apiKey, voiceId, text, outPath, opts) {
  const buf = await tts(apiKey, voiceId, text, opts);
  writeFileSync(outPath, buf);
  return outPath;
}
