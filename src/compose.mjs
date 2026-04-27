// Compose the spoken sentence from config + message + desktop index.
//
// Templates live at src/templates/{helperGender}/{length}.json. Each file is
// an array of strings with placeholders: {name}, {address}, {desktop},
// {message}. The composer picks one at random (rotates so it doesn't sound
// canned), substitutes, and returns the final sentence.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES_DIR } from './paths.mjs';

const ADDRESS_BY_GENDER = {
  male: { he: 'my man', she: 'my dear', they: 'my friend' },
  female: { he: 'your highness', she: 'my queen', they: 'your highness' },
  neutral: { he: 'friend', she: 'friend', they: 'friend' },
};

function pickAddress(helperGender, userGender) {
  const map = ADDRESS_BY_GENDER[helperGender] || ADDRESS_BY_GENDER.neutral;
  const key = userGender?.startsWith('he') ? 'he' : userGender?.startsWith('she') ? 'she' : 'they';
  return map[key];
}

function loadTemplates(helperGender, length) {
  const file = join(TEMPLATES_DIR, helperGender, `${length}.json`);
  if (!existsSync(file)) {
    // Fallback to neutral/medium if config is missing a combo.
    const fallback = join(TEMPLATES_DIR, 'neutral', 'medium.json');
    if (!existsSync(fallback)) {
      // Hard fallback: a single literal template.
      return ['{name}, calling from desktop {desktop}, {message}.'];
    }
    return JSON.parse(readFileSync(fallback, 'utf8'));
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Build the spoken sentence.
 *
 * @param {object} cfg - User config (name, your_gender, helper_gender, sentence_length)
 * @param {string} message - The actual thing to say
 * @param {number} desktopIndex - 1-based current desktop
 * @param {object} [opts]
 * @param {string} [opts.lengthOverride] - short|medium|long override
 * @returns {string}
 */
export function compose(cfg, message, desktopIndex, opts = {}) {
  const length = opts.lengthOverride || cfg.sentence_length || 'medium';
  const helperGender = cfg.helper_gender || 'neutral';
  const userGender = cfg.your_gender || 'they/them';
  const templates = loadTemplates(helperGender, length);
  const template = templates[Math.floor(Math.random() * templates.length)];
  const address = pickAddress(helperGender, userGender);
  return template
    .replaceAll('{name}', cfg.name || 'friend')
    .replaceAll('{address}', address)
    .replaceAll('{desktop}', String(desktopIndex))
    .replaceAll('{message}', message)
    .replace(/\s+/g, ' ')
    .trim();
}
