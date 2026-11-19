#!/usr/bin/env node
/**
 * Download a YouTube video.
 * Usage: node src/download.js <URL> <output_path>
 * Downloads best mp4 to output_path.
 */
import { spawnSync } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node src/download.js <URL> <output_path>');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });

const result = spawnSync('yt-dlp', [
  '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
  '--merge-output-format', 'mp4',
  '--no-playlist',
  '-o', out,
  url,
], { stdio: 'inherit', timeout: 600_000 });

process.exit(result.status ?? 1);
