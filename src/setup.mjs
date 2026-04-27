// First-run wizard. Arrow-key UI via @inquirer/prompts + a custom raw-mode
// audition picker for sounds and voices.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { input, password, select } from '@inquirer/prompts';
import { saveConfig, saveEnv, loadConfig, loadEnv } from './config.mjs';
import { listVoices, tts } from './voice.mjs';
import { playAsync } from './play.mjs';
import { speak } from './speak.mjs';
import { arrowPick } from './picker.mjs';
import { INTROS_DIR, ENV_FILE, CONFIG_FILE } from './paths.mjs';

const SAMPLE_TEXT = (name) => `Hi ${name}, I am your new helper.`;

function filterVoicesForHelper(voices, helperGender) {
  if (helperGender === 'neutral') return voices;
  return voices.filter((v) => {
    const g = (v.labels?.gender || '').toLowerCase();
    return g === helperGender;
  });
}

async function pickVoice(apiKey, voices, helperGender, name) {
  let candidates = filterVoicesForHelper(voices, helperGender);
  if (candidates.length === 0) {
    console.log(`   (no ${helperGender} voices in your account - showing all)`);
    candidates = voices;
  }
  candidates = candidates.slice(0, 4);
  if (candidates.length === 0) {
    throw new Error('No voices available in your ElevenLabs account.');
  }

  console.log(`\n   Generating ${candidates.length} voice samples (one moment)...`);
  const samples = [];
  for (const v of candidates) {
    process.stdout.write(`     - ${v.name}... `);
    const bytes = await tts(apiKey, v.voice_id, SAMPLE_TEXT(name));
    const path = join(tmpdir(), `cms-voice-${v.voice_id}.mp3`);
    writeFileSync(path, bytes);
    samples.push({ voice: v, path });
    process.stdout.write('ok\n');
  }

  let currentPlay = null;
  const items = samples.map((s) => ({
    label: `${s.voice.name}${s.voice.labels?.accent ? ` (${s.voice.labels.accent})` : ''}`,
    value: s,
  }));
  const result = await arrowPick({
    items,
    title: '\n6) Voice picker - left/right to audition each, Enter to pick',
    onChange: (item) => {
      if (currentPlay) currentPlay.cancel();
      currentPlay = playAsync(item.value.path);
    },
    allowSkip: false,
  });
  if (currentPlay) currentPlay.cancel();
  if (result.cancelled) throw new Error('cancelled at voice pick');
  return result.value.voice;
}

async function pickIntro() {
  if (!existsSync(INTROS_DIR)) {
    console.log('\n7) Intro music: no bundled intros found, skipping.');
    return 'none';
  }
  const files = readdirSync(INTROS_DIR)
    .filter((f) => /^intro-\d{2}\.(mp3|wav)$/i.test(f))
    .sort();
  if (files.length === 0) {
    console.log('\n7) Intro music: no bundled intros found, skipping.');
    return 'none';
  }
  let currentPlay = null;
  const items = files.map((f, i) => ({
    label: f.replace(/\.(mp3|wav)$/i, ''),
    value: i + 1,
    path: join(INTROS_DIR, f),
  }));
  const result = await arrowPick({
    items,
    title: '\n7) Intro music - left/right to audition each, Enter to pick, s to skip',
    onChange: (item) => {
      if (currentPlay) currentPlay.cancel();
      currentPlay = playAsync(item.path);
    },
    allowSkip: true,
  });
  if (currentPlay) currentPlay.cancel();
  if (result.skipped || result.cancelled) return 'none';
  return result.value;
}

export async function runSetup() {
  console.log('\n=== call-me-skill setup ===\n');
  console.log(`Config -> ${CONFIG_FILE}`);
  console.log(`Secrets -> ${ENV_FILE}\n`);

  const existing = loadConfig();
  if (existing) console.log('Existing config found - re-running will overwrite.\n');

  // 1. Name
  const name = await input({
    message: '1) Your name',
    default: existing?.name || 'friend',
  });

  // 2. Your gender (skip allowed)
  const yourGender = await select({
    message: '2) Your gender (used in complimentary phrasing)',
    default: existing?.your_gender ?? '',
    choices: [
      { name: 'he/him', value: 'he/him' },
      { name: 'she/her', value: 'she/her' },
      { name: 'skip / prefer not to say', value: '' },
    ],
  });

  // 3. Helper voice style (drives addressing AND filters voice candidates)
  const helperGender = await select({
    message: '3) Helper voice style',
    default: existing?.helper_gender || 'male',
    choices: [
      { name: 'male  - addressing: "my man", "buddy"', value: 'male' },
      { name: 'female - addressing: "my queen", "your highness"', value: 'female' },
      { name: 'neutral - addressing: "friend"',         value: 'neutral' },
    ],
  });

  // 4. Sentence length
  const length = await select({
    message: '4) Sentence length',
    default: existing?.sentence_length || 'medium',
    choices: [
      { name: 'short  ("Ziv from desktop 2: build broke")', value: 'short' },
      { name: 'medium ("Ziv, my man, calling from desktop 2: build broke")', value: 'medium' },
      { name: 'long   (more elaborate phrasing)', value: 'long' },
    ],
  });

  // 5. ElevenLabs API key (skip = keep existing)
  const existingKey = loadEnv()?.ELEVENLABS_API_KEY || '';
  let apiKey = existingKey;
  const keyAnswer = await password({
    message: existingKey
      ? '5) ElevenLabs API key (press Enter to keep existing)'
      : '5) ElevenLabs API key (https://elevenlabs.io/app/settings/api-keys)',
    mask: '*',
  });
  if (keyAnswer) apiKey = keyAnswer.trim();
  if (!apiKey) {
    console.log('   -> ElevenLabs key required to continue. Aborting.');
    return;
  }
  saveEnv({ ELEVENLABS_API_KEY: apiKey });

  console.log('\n   Fetching voices from your ElevenLabs account...');
  const voices = await listVoices(apiKey);
  if (voices.length === 0) {
    console.log('   -> no voices found. Add some in your ElevenLabs account, then re-run.');
    return;
  }

  // 6. Voice audition (filtered by helper gender)
  const voice = await pickVoice(apiKey, voices, helperGender, name);
  console.log(`\n   -> picked voice: ${voice.name} (${voice.voice_id})`);

  // 7. Intro music
  const introIndex = await pickIntro();
  console.log(`   -> intro: ${introIndex === 'none' ? 'none' : '#' + introIndex}`);

  // Save config
  const cfg = {
    name,
    your_gender: yourGender || 'they/them',
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

  // 9. Auto-install + start the hotkey daemon. No prompt - it's ~40MB resident,
  // listens for one global hotkey to jump you back to the calling window. The
  // user can disable later with `call-me-skill daemon uninstall`.
  console.log('\n9) Installing hotkey daemon (autostart on login + starting now)...');
  try {
    const { installAutostart, autostartPath } = await import('./autostart.mjs');
    const { daemonStart } = await import('./daemon-cli.mjs');
    const path = installAutostart();
    console.log(`   -> autostart: ${path}`);
    daemonStart();
    console.log('   -> press the hotkey shown in daemon.log to jump back to a calling window.');
  } catch (e) {
    console.log('   -> autostart install failed:', e.message);
  }

  console.log('\nSetup done. Try:  call-me-skill speak "render finished"');
  console.log('Disable autostart anytime with:  call-me-skill daemon uninstall\n');
}
