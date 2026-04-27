// Build-time script. Generates 10 short ElevenLabs SFX intro chimes (~2.5s
// each) and writes them to assets/intros/. Run by maintainers.
//
// Usage:
//   ELEVENLABS_API_KEY=sk_... node scripts/generate-intros.mjs
//
// End users get these pre-bundled in the npm package - they do NOT need an
// ElevenLabs key just for the chimes. The key is only used by the wizard to
// pick a TTS voice and speak alerts.
//
// Why SFX, not Lyria: ElevenLabs SFX returns a clip of exactly the duration
// you ask for (0.5-22s). Lyria pads everything to 30s and we had to truncate
// at playback time, which felt wrong.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSfxToFile } from '../src/sfx.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'intros');
mkdirSync(OUT_DIR, { recursive: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('Set ELEVENLABS_API_KEY (get one at https://elevenlabs.io/app/settings/api-keys)');
  process.exit(1);
}

const PROMPTS = [
  { id: '01', name: 'tech-chime',     duration: 2.0, prompt: 'Upbeat tech notification chime, modern startup vibe, clean synth bell, single hit, no melody.' },
  { id: '02', name: 'jazzy-piano',    duration: 2.5, prompt: 'Soft jazzy wake-up cue, warm piano single chord, mellow, no drums.' },
  { id: '03', name: 'synthwave-bell', duration: 2.5, prompt: 'Crisp synthwave bell, retro-future, single sparkly hit with reverb tail.' },
  { id: '04', name: 'xylophone',      duration: 2.0, prompt: 'Playful xylophone notification, friendly, three quick ascending wood notes.' },
  { id: '05', name: 'orchestral-hit', duration: 2.5, prompt: 'Dramatic orchestral hit, epic but short, brass and strings, single stinger.' },
  { id: '06', name: 'ambient-chime',  duration: 3.0, prompt: 'Gentle ambient chime, meditation app style, soft singing bowl with airy tail.' },
  { id: '07', name: '8bit-coin',      duration: 1.5, prompt: '8-bit arcade coin pickup sound, chiptune, two quick high notes.' },
  { id: '08', name: 'apple-marimba',  duration: 2.0, prompt: 'Modern marimba alert, Apple-style, three bright wood notes ascending.' },
  { id: '09', name: 'lofi-sting',     duration: 3.0, prompt: 'Lo-fi hip-hop sting, chill, vinyl crackle with one mellow Rhodes chord.' },
  { id: '10', name: 'news-broadcast', duration: 2.0, prompt: 'News broadcast sting, slightly comedic, brass-and-snare network ID feel.' },
];

let ok = 0, fail = 0;
for (const p of PROMPTS) {
  const out = join(OUT_DIR, `intro-${p.id}.mp3`);
  process.stdout.write(`[${p.id}] ${p.name} (${p.duration}s)... `);
  try {
    await generateSfxToFile(apiKey, p.prompt, out, { duration: p.duration });
    ok++;
    process.stdout.write(`ok -> ${out}\n`);
  } catch (e) {
    fail++;
    process.stdout.write(`FAIL: ${e.message}\n`);
  }
}

console.log(`\nDone. ${ok} ok, ${fail} failed.`);
console.log(`Output: ${OUT_DIR}`);
