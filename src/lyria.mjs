// Vertex AI Lyria 2 (lyria-002) music generation.
//
// Uses a Google service account JSON, either at the path in
// GOOGLE_VERTEX_SA_JSON_FILE or with the JSON content in
// GOOGLE_VERTEX_SA_JSON. Used at *build time* to generate the 10 bundled
// intro MP3s; end users never touch this.
import { readFileSync, writeFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

function loadCredentials() {
  const filePath = process.env.GOOGLE_VERTEX_SA_JSON_FILE;
  if (filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  }
  const inline = process.env.GOOGLE_VERTEX_SA_JSON;
  if (!inline) {
    throw new Error(
      'Set GOOGLE_VERTEX_SA_JSON_FILE (path) or GOOGLE_VERTEX_SA_JSON (inline JSON)'
    );
  }
  return JSON.parse(inline);
}

let cachedAuth = null;
function getAuth() {
  if (cachedAuth) return cachedAuth;
  cachedAuth = new GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return cachedAuth;
}

/**
 * Generate a Lyria 2 (lyria-002) audio clip.
 *
 * Output: WAV bytes (Lyria 2 only emits WAV). Caller can convert to MP3 via
 * ffmpeg if needed; for our intros we save WAV directly to disk and let the
 * downstream player handle it (Windows MediaPlayer plays both).
 *
 * @param {string} prompt - Music prompt (e.g. "upbeat 2 second tech chime")
 * @param {object} [opts]
 * @param {string} [opts.negativePrompt]
 * @param {number} [opts.sampleCount=1]
 * @returns {Promise<{audioBytes: Buffer, mimeType: 'audio/wav'}>}
 */
export async function generateLyria2(prompt, opts = {}) {
  const credentials = loadCredentials();
  const projectId = credentials.project_id;
  if (!projectId) throw new Error('SA JSON missing project_id');

  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = tokenResp?.token || tokenResp;
  if (!token || typeof token !== 'string') {
    throw new Error('Failed to mint Vertex access token');
  }

  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/lyria-002:predict`;

  const body = {
    instances: [
      {
        prompt,
        ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
      },
    ],
    parameters: {
      sample_count: opts.sampleCount || 1,
    },
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (r.status !== 200) {
    throw new Error(`Lyria predict failed: ${r.status} ${(await r.text()).slice(0, 400)}`);
  }
  const json = await r.json();
  const pred = json?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error(`Lyria response missing bytesBase64Encoded: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    audioBytes: Buffer.from(pred.bytesBase64Encoded, 'base64'),
    mimeType: pred.mimeType || 'audio/wav',
  };
}

export async function generateLyria2ToFile(prompt, outPath, opts) {
  const { audioBytes } = await generateLyria2(prompt, opts);
  writeFileSync(outPath, audioBytes);
  return outPath;
}
