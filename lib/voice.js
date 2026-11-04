/**
 * JARVIS – Server-seitige Sprachsynthese via ElevenLabs.
 * Gibt Buffer (MP3) zurück, oder null wenn kein ElevenLabs konfiguriert.
 */
import https from 'node:https';

const EL_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID ?? '';
const EL_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';

export async function speak(text) {
  if (!EL_KEY || !EL_VOICE) return null;

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      text,
      model_id: EL_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${EL_VOICE}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'xi-api-key': EL_KEY,
          Accept: 'audio/mpeg',
        },
      },
      res => {
        if (res.statusCode !== 200) {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            reject(new Error(`ElevenLabs ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`));
          });
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
