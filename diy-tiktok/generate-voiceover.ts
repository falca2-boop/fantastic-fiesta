// Run with: ELEVENLABS_API_KEY=sk_... node --strip-types generate-voiceover.ts
// Generates one MP3 per scene into public/voiceover/

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY environment variable");
  process.exit(1);
}

// German male voice — "Daniel" works well for DIY content
// You can replace with any voice ID from: https://api.elevenlabs.io/v1/voices
const VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel (German)

const SCENES = [
  {
    id: "intro",
    text: "Heute bauen wir zusammen ein Regal! Schritt für Schritt zeige ich euch, wie das geht.",
  },
  {
    id: "materials",
    text: "Das braucht ihr: Holzbretter, Schrauben, eine Bohrmaschine und matten Klarlack.",
  },
  {
    id: "measure",
    text: "Schritt eins: Messen! Alle Bretter auf achtzig Zentimeter abmessen. Genauigkeit ist hier wichtig!",
  },
  {
    id: "drill",
    text: "Schritt zwei: Vorbohren! Bohrt die Löcher immer vor — so reißt das Holz nicht.",
  },
  {
    id: "assemble",
    text: "Schritt drei: Zusammenbauen! Seitenteile zusammenstecken und die Regalböden festschrauben. Schrauben nicht zu fest anziehen!",
  },
  {
    id: "paint",
    text: "Schritt vier: Lackieren! Zwei Schichten matten Klarlack auftragen und trocknen lassen.",
  },
  {
    id: "outro",
    text: "Fertig! Euer selbst gebautes Regal ist fertig! Gebt uns einen Daumen hoch und folgt uns für mehr DIY Projekte!",
  },
];

const OUT_DIR = join("public", "voiceover");
mkdirSync(OUT_DIR, { recursive: true });

async function generateVoice(text: string, outputPath: string) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${err}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  writeFileSync(outputPath, audio);
  return audio.length;
}

console.log(`Generating ${SCENES.length} voiceover clips...\n`);
let totalBytes = 0;

for (const scene of SCENES) {
  const path = join(OUT_DIR, `${scene.id}.mp3`);
  process.stdout.write(`  ${scene.id}... `);
  try {
    const bytes = await generateVoice(scene.text, path);
    totalBytes += bytes;
    console.log(`✓ (${(bytes / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(`✗ ${e}`);
    process.exit(1);
  }
}

console.log(`\nDone! Total: ${(totalBytes / 1024).toFixed(0)} KB`);
console.log("Files saved to public/voiceover/");
console.log("\nNow run: npx remotion render DIYTikTok out/diy-regal-voice.mp4");
