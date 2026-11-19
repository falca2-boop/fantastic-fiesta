#!/usr/bin/env node
/**
 * Cut a clip from a video using ffmpeg.
 * Usage: node src/cut.js <input> <start_sec> <end_sec> <output>
 * Uses stream copy (no re-encode) for speed.
 */
import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const [input, startStr, endStr, output] = process.argv.slice(2);
if (!input || !startStr || !endStr || !output) {
  console.error('Usage: node src/cut.js <input> <start_sec> <end_sec> <output>');
  process.exit(1);
}

const start = parseFloat(startStr);
const duration = parseFloat(endStr) - start;

mkdirSync(dirname(output), { recursive: true });

const result = spawnSync('ffmpeg', [
  '-y',
  '-ss', String(start),
  '-i', input,
  '-t', String(duration),
  '-c', 'copy',
  '-avoid_negative_ts', 'make_zero',
  output,
], { stdio: 'inherit', timeout: 120_000 });

if (result.status !== 0) {
  // Re-encode fallback if stream copy fails (e.g. keyframe issues)
  const retry = spawnSync('ffmpeg', [
    '-y',
    '-ss', String(start),
    '-i', input,
    '-t', String(duration),
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    '-c:a', 'aac',
    output,
  ], { stdio: 'inherit', timeout: 300_000 });
  process.exit(retry.status ?? 1);
}
