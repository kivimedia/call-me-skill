// First-run wizard. 8 questions + an intro audition + a test alert.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { saveConfig, saveEnv, loadConfig, loadEnv } from './config.mjs';
import { listVoices } from './voice.mjs';
import { playSequence } from './play.mjs';
import { speak } from './speak.mjs';
import { INTROS_DIR, ENV_FILE, CONFIG_FILE } from './paths.mjs';

async function ask(rl, q, { default: def, choices } = {}) {
  let prompt = q;
  if (choices) prompt += ` (${choices.join('/')})`;
  if (def !== undefined) prompt += ` [${def}]`;
  prompt += ': ';
  while (true) {
    const a = (await rl.question(prompt)).trim();
    if (!a && def !== undefined) return def;
    if (!a) continue;
    if (choices && !choices.includes(a)) {
      console.log(`  -> please pick one of: ${choices.join(', ')}`);
      continue;
    }
    return a;
  }
}

export async function runSetup() {
  console.log('\n=== call-me-skill setup ===\n');
  console.log(`Config -> ${CONFIG_FILE}`);
  console.log(`Secrets -> ${ENV_FILE}\n`);

  const existing = loadConfig();
  if (existing) {
    console.log('Existing config found. Re-running will overwrite.');
  }

  const rl = createInterface({ input, output });

  try {
    // 1. Name
    const name = await ask(rl, '1) Your name', { default: existing?.name || 'friend' });

    // 2. User gender
    const yourGender = await ask(rl, '2) Your gender (for compliments)', {
      default: existing?.your_gender || 'they/them',
      choices: ['he/him', 'she/her', 'they/them'],
    });

    // 3. Helper gender
    const helperGender = await ask(rl, '3) Helper gender (drives addressing style)', {
      default: existing?.helper_gender || 'neutral',
      choices: ['male', 'female', 'neutral'],
    });

    // 4. Sentence length
    const length = await ask(rl, '4) Sentence length', {
      default: existing?.sentence_length || 'medium',
      choices: ['short', 'medium', 'long'],
    });

    // 5. Intro music
    const introFiles = existsSync(INTROS_DIR)
      ? readdirSync(INTROS_DIR)
          .filter((f) => /^intro-\d{2}\.(wav|mp3)$/i.test(f))
          .sort()
      : [];
    let introIndex = 'none';
    if (introFiles.length === 0) {
      console.log('   (no bundled intros found - skipping)');
    } else {
      console.log(`5) Intro music: ${introFiles.length} clips available.`);
      console.log('   Type a number 1-' + introFiles.length + ' to audition (will play once).');
      console.log('   Type "ok N" to pick clip N (e.g. "ok 3").');
      console.log('   Type "none" to skip intro music.');
      while (true) {
        const a = (await rl.question('   > ')).trim().toLowerCase();
        if (a === 'none' || a === '') {
          introIndex = 'none';
          break;
        }
        const okMatch = a.match(/^ok\s+(\d+)$/);
        if (okMatch) {
          const n = parseInt(okMatch[1], 10);
          if (n >= 1 && n <= introFiles.length) {
            introIndex = n;
            console.log(`   -> picked intro #${n}`);
            break;
          }
          console.log('   -> out of range');
          continue;
        }
        const n = parseInt(a, 10);
        if (n >= 1 && n <= introFiles.length) {
          const file = introFiles[n - 1];
          console.log(`   playing intro #${n} (${file})...`);
          playSequence([join(INTROS_DIR, file)], { maxSecondsEach: 5 });
          continue;
        }
        console.log('   -> didn\'t understand. number to audition, "ok N" to pick, "none" to skip');
      }
    }

    // 6. ElevenLabs API key
    let apiKey = (loadEnv()?.ELEVENLABS_API_KEY) || '';
    const keyAnswer = await ask(rl, `6) ElevenLabs API key${apiKey ? ' (press enter to keep existing)' : ''}`, {
      default: apiKey ? '__keep__' : undefined,
    });
    if (keyAnswer && keyAnswer !== '__keep__') apiKey = keyAnswer;
    if (!apiKey) {
      console.log('   -> ElevenLabs key required to continue.');
      return;
    }
    saveEnv({ ELEVENLABS_API_KEY: apiKey });

    // 7. Voice picker
    console.log('7) Fetching voices from your ElevenLabs account...');
    const voices = await listVoices(apiKey);
    if (voices.length === 0) {
      console.log('   -> no voices found. Try a different API key or add voices to your account.');
      return;
    }
    voices.forEach((v, i) => {
      const labelBits = [];
      if (v.labels?.gender) labelBits.push(v.labels.gender);
      if (v.labels?.accent) labelBits.push(v.labels.accent);
      if (v.labels?.description) labelBits.push(v.labels.description);
      console.log(`   ${i + 1}) ${v.name}  (${v.category}${labelBits.length ? ', ' + labelBits.join(', ') : ''})`);
    });
    const voicePick = await ask(rl, `Pick a voice (1-${voices.length})`, {
      default: '1',
    });
    const vIdx = Math.max(1, Math.min(voices.length, parseInt(voicePick, 10) || 1)) - 1;
    const voice = voices[vIdx];
    console.log(`   -> picked: ${voice.name} (${voice.voice_id})`);

    // Save config.
    const cfg = {
      name,
      your_gender: yourGender,
      helper_gender: helperGender,
      sentence_length: length,
      intro_index: introIndex,
      voice_id: voice.voice_id,
      voice_name: voice.name,
      version: 1,
      saved_at: new Date().toISOString(),
    };
    saveConfig(cfg);

    // 8. Test alert
    console.log('\n8) Playing test alert...');
    try {
      const result = await speak('Setup complete', { length: 'short' });
      console.log(`   -> spoken: "${result.sentence}"`);
      console.log(`   -> from desktop ${result.desktopIndex}`);
    } catch (e) {
      console.log('   -> test failed:', e.message);
    }

    console.log('\nSetup done. Try:  call-me-skill speak "render finished"\n');
    console.log('Daemon + double-Ctrl jump: not in v0.1. See README "Roadmap".\n');
  } finally {
    rl.close();
  }
}
