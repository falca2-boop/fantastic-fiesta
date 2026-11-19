# yt-clipper-agent

> Paste any YouTube link. Get the best clips back.

A Claude Code agent that automatically finds and cuts the most exciting moments from any YouTube video or live stream — ranked best first.

```
> clip this: youtube.com/live/gta-6-day-one

● Stream is live. Recording + reading chat…
● 6 moments found. Cutting and editing…
✓ 6 clips ready · ranked best first
```

---

## How it works

| Link type | What it does |
|-----------|-------------|
| **Live now** | Records while the stream is live, reads chat in real time |
| **Ended stream** | Finds where viewers went crazy using chat replay |
| **Any video** | Analyzes transcript for fails, clutch plays, reveals (15–60 s each) |

The agent uses `yt-dlp` to get subtitles and chat data, sends them to Claude for moment detection, then uses `ffmpeg` to cut the clips — no manual editing needed.

---

## Requirements

- **Node.js** ≥ 20
- **yt-dlp** — download/transcripts/chat
- **ffmpeg** — video cutting
- **Anthropic API key** — for moment analysis

```bash
# macOS
brew install yt-dlp ffmpeg

# Linux
pip install yt-dlp && sudo apt install ffmpeg

# Windows
scoop install yt-dlp ffmpeg
```

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Usage

### As a Claude Code agent

```bash
claude
```

Then type or paste a YouTube URL — the `clipper` agent picks it up automatically.

### As a CLI tool

```bash
node src/clip.js https://youtube.com/watch?v=VIDEOID
node src/clip.js https://youtube.com/live/STREAMID --keep-raw
```

Clips are saved to `./clips/`.

---

## Project structure

```
src/
  info.js        get video metadata (type, duration, title)
  transcript.js  download + parse subtitles → [{start, end, text}]
  chat.js        download + parse live chat → [{time, author, message}]
  download.js    download best-quality mp4
  cut.js         cut a clip with ffmpeg (stream copy, re-encode fallback)
  clip.js        full pipeline CLI entry point
.claude/agents/
  clipper.md     Claude Code agent definition
```

---

## Output example

```
✓  6 clips ready · ranked best first

  1. clips/clip_1_dQw4w9WgXcQ.mp4   [2:22–2:58]  score 9  — clutch 1v3, chat exploded
  2. clips/clip_2_dQw4w9WgXcQ.mp4   [14:07–14:51] score 8  — surprise reveal
  3. clips/clip_3_dQw4w9WgXcQ.mp4   [31:02–31:44] score 7  — funny fail
  ...
```

---

## License

MIT
