// Build-time script. Generates 10 short Lyria 2 intros and writes them to
// assets/intros/. Run by maintainers, not end users. End users get the
// pre-bundled WAVs from the npm package.
//
// Usage:
//   GOOGLE_VERTEX_SA_JSON_FILE=C:\path\to\sa.json node scripts/generate-intros.mjs
//   (or set GOOGLE_VERTEX_SA_JSON to the inline JSON)
//
// Lyria 2 always emits 30-second WAVs - the prompts ask for "intro/sting"
// content but the model still pads to 30s. End users only hear the first
// ~2-3 seconds because the speak.mjs queue moves on after the TTS finishes.
// (Future: trim with ffmpeg if available; for v0.1 we just use the first
// few seconds of each WAV by capping playback in play.mjs.)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLyria2ToFile } from '../src/lyria.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'intros');
mkdirSync(OUT_DIR, { recursive: true });

const PROMPTS = [
  { id: '01', name: 'tech-chime',     prompt: 'Upbeat tech notification chime, 2 seconds, modern startup vibe, clean synth bell, no melody, single hit.' },
  { id: '02', name: 'jazzy-piano',    prompt: 'Soft jazzy 2-second wake-up cue, warm piano single chord, mellow, no drums.' },
  { id: '03', name: 'synthwave-bell', prompt: 'Crisp synthwave bell, 2 seconds, retro-future, single sparkly hit with reverb tail.' },
  { id: '04', name: 'xylophone',      prompt: 'Playful 2-second xylophone notification, friendly, three quick ascending notes.' },
  { id: '05', name: 'orchestral-hit', prompt: 'Dramatic 3-second orchestral hit, epic but short, brass and strings, single stinger.' },
  { id: '06', name: 'ambient-chime',  prompt: 'Gentle ambient 2-second chime, meditation app style, soft singing bowl with airy tail.' },
  { id: '07', name: '8bit-coin',      prompt: '8-bit arcade coin pickup sound, 1.5 seconds, chiptune, two quick high notes.' },
  { id: '08', name: 'apple-marimba',  prompt: 'Modern marimba 2-second alert, Apple-style, three bright wood notes ascending.' },
  { id: '09', name: 'lofi-sting',     prompt: 'Lo-fi hip-hop 3-second sting, chill, vinyl crackle with one mellow Rhodes chord.' },
  { id: '10', name: 'news-broadcast', prompt: 'News broadcast 2-second sting, slightly comedic, brass-and-snare network ID feel.' },
];

let ok = 0, fail = 0;
for (const p of PROMPTS) {
  const out = join(OUT_DIR, `intro-${p.id}.wav`);
  process.stdout.write(`[${p.id}] ${p.name}... `);
  try {
    await generateLyria2ToFile(p.prompt, out);
    ok++;
    process.stdout.write(`ok -> ${out}\n`);
  } catch (e) {
    fail++;
    process.stdout.write(`FAIL: ${e.message}\n`);
  }
}

console.log(`\nDone. ${ok} ok, ${fail} failed.`);
console.log(`Output: ${OUT_DIR}`);
