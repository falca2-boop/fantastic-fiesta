#!/usr/bin/env node
/**
 * Download and parse live chat replay for an ended YouTube stream.
 * Usage: node src/chat.js <URL>
 * Prints JSON array: [{ time, author, message, superChat }] with time in seconds.
 */
import { spawnSync } from 'child_process';
import { readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';

const url = process.argv[2];
if (!url) { console.error('Usage: node src/chat.js <URL>'); process.exit(1); }

const dir = mkdtempSync(join(tmpdir(), 'yt-chat-'));

const result = spawnSync('yt-dlp', [
  '--write-subs',
  '--skip-download',
  '--sub-lang', 'live_chat',
  '--output', join(dir, '%(id)s.%(ext)s'),
  '--no-playlist',
  url,
], { encoding: 'utf8', timeout: 120_000 });

if (result.status !== 0) {
  console.error('No chat replay available:', result.stderr?.slice(0, 300));
  console.log('[]');
  process.exit(0);
}

const files = readdirSync(dir).filter(f => f.endsWith('.json'));
if (!files.length) {
  console.log('[]');
  process.exit(0);
}

const raw = readFileSync(join(dir, files[0]), 'utf8');

// Each line is a JSON object (JSONL format from yt-dlp)
const messages = [];
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }

  const r = obj.replayChatItemAction?.actions?.[0]?.addChatItemAction?.item;
  if (!r) continue;

  const live = r.liveChatTextMessageRenderer ?? r.liveChatPaidMessageRenderer;
  if (!live) continue;

  const time = Number(live.videoOffsetTimeMsec ?? 0) / 1000;
  const text = live.message?.runs?.map(x => x.text ?? '').join('') ?? '';
  const author = live.authorName?.simpleText ?? '';
  const superChat = !!r.liveChatPaidMessageRenderer;
  const amount = live.purchaseAmountText?.simpleText ?? null;

  messages.push({ time, author, message: text, superChat, amount });
}

files.forEach(f => { try { unlinkSync(join(dir, f)); } catch {} });

console.log(JSON.stringify(messages, null, 2));
