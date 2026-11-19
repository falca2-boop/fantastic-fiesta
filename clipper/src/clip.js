#!/usr/bin/env node
/**
 * CLI entry point — orchestrates the full clipping pipeline.
 * Usage: node src/clip.js <YouTube-URL> [--keep-raw]
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const url   = process.argv[2];
const keep  = process.argv.includes('--keep-raw');
if (!url) { console.error('Usage: node src/clip.js <URL> [--keep-raw]'); process.exit(1); }

const run = cmd => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });

// ── 1. Check dependencies ────────────────────────────────────────────────────
for (const bin of ['yt-dlp', 'ffmpeg']) {
  try { run(`which ${bin}`); }
  catch { console.error(`\n  Missing: ${bin}\n  See README for install instructions.\n`); process.exit(1); }
}

// ── 2. Video info ────────────────────────────────────────────────────────────
process.stdout.write('● Fetching video info…\n');
const info = JSON.parse(run(`node src/info.js "${url}"`));
console.log(`  ${info.title} [${info.type}]`);

mkdirSync('clips', { recursive: true });

// ── 3. Transcript ────────────────────────────────────────────────────────────
process.stdout.write('● Downloading transcript…\n');
let transcript = [];
try {
  transcript = JSON.parse(run(`node src/transcript.js "${url}"`));
  console.log(`  ${transcript.length} subtitle segments`);
} catch {
  console.log('  No subtitles — will sample evenly');
}

// ── 4. Chat replay (ended streams) ──────────────────────────────────────────
let chat = [];
if (info.type === 'ended') {
  process.stdout.write('● Downloading chat replay…\n');
  try {
    chat = JSON.parse(run(`node src/chat.js "${url}"`));
    console.log(`  ${chat.length} chat messages`);
  } catch {
    console.log('  No chat replay available');
  }
}

// ── 5. Analyze with Claude ───────────────────────────────────────────────────
process.stdout.write('● Analyzing for best moments…\n');
const client = new Anthropic();

const transcriptText = transcript.length
  ? transcript.map(s => `[${s.start.toFixed(0)}s] ${s.text}`).join('\n')
  : 'No transcript available.';

const chatText = chat.length
  ? chat.slice(0, 2000).map(m => `[${m.time.toFixed(0)}s] ${m.author}: ${m.message}${m.superChat ? ' 💰' : ''}`).join('\n')
  : '';

const prompt = `You are a video clip editor. Analyze this ${info.type === 'live' ? 'live stream' : info.type === 'ended' ? 'ended live stream' : 'video'} and find the 6 best moments to clip.

Video: "${info.title}"
Duration: ${info.duration ? Math.round(info.duration) + 's' : 'unknown'}

TRANSCRIPT:
${transcriptText.slice(0, 8000)}

${chatText ? `CHAT REPLAY (shows viewer reactions):\n${chatText.slice(0, 4000)}` : ''}

Rules:
- Each clip must be 15–60 seconds
- Look for: clutch plays, funny moments, fails, reveals, big reactions, hype peaks
- For streams: weight moments where chat went crazy (lots of caps, emotes, "PogChamp", "WHAT", "???")
- Each clip must be self-contained and make sense without context

Return ONLY valid JSON — an array of exactly 6 objects:
[
  { "start": <seconds>, "end": <seconds>, "reason": "<short description>", "score": <1-10> }
]
Sorted by score descending.`;

const response = await client.messages.create({
  model: 'claude-opus-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
});

let moments = [];
try {
  const jsonMatch = response.content[0].text.match(/\[[\s\S]*\]/);
  moments = JSON.parse(jsonMatch[0]);
} catch {
  // Fallback: even-interval sampling
  console.log('  Analysis fallback — using even intervals');
  const dur = info.duration ?? 600;
  const step = Math.floor(dur / 6);
  moments = Array.from({ length: 6 }, (_, i) => ({
    start: i * step, end: i * step + 30,
    reason: `segment ${i + 1} (unranked)`, score: 5,
  }));
}

console.log(`  ${moments.length} moments identified`);

// ── 6. Download video ────────────────────────────────────────────────────────
const rawPath = join('clips', `raw_${info.id}.mp4`);
if (!existsSync(rawPath)) {
  process.stdout.write('● Downloading video…\n');
  execSync(`node src/download.js "${url}" "${rawPath}"`, { stdio: 'inherit' });
}

// ── 7. Cut clips ─────────────────────────────────────────────────────────────
process.stdout.write('● Cutting clips…\n');
const clips = [];
for (let i = 0; i < moments.length; i++) {
  const m = moments[i];
  const out = join('clips', `clip_${i + 1}_${info.id}.mp4`);
  execSync(`node src/cut.js "${rawPath}" ${m.start} ${m.end} "${out}"`, { stdio: 'inherit' });
  clips.push({ ...m, file: out });
  process.stdout.write(`  clip ${i + 1}/${moments.length} done\n`);
}

// ── 8. Cleanup & report ──────────────────────────────────────────────────────
if (!keep) {
  try { unlinkSync(rawPath); } catch {}
}

const fmt = s => {
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

console.log(`\n✓  ${clips.length} clips ready · ranked best first\n`);
clips.forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.file.padEnd(40)} [${fmt(c.start)}–${fmt(c.end)}]  score ${c.score}  — ${c.reason}`);
});
console.log('');
